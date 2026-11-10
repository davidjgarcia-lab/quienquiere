-- =====================================================================
-- ¿QUIÉN QUIERE CASARSE CON ADRI? — Esquema, seguridad y lógica de juego
-- =====================================================================
-- Modelo de seguridad:
--   * Las tablas NO son accesibles para el rol anon (jugador). RLS activado
--     y sin políticas para anon. El jugador solo puede usar funciones
--     SECURITY DEFINER que reciben la clave secreta de jugador (player_key)
--     y devuelven el estado SIN la respuesta correcta hasta que el
--     presentador la revela.
--   * El presentador es un usuario autenticado de Supabase Auth. Todas sus
--     acciones pasan por funciones que verifican games.host_id = auth.uid().
--   * Cada cambio de estado emite un Broadcast (realtime.send) al topic
--     público "qqc:<player_key>" con solo un número de versión. Los clientes
--     vuelven a pedir el estado por RPC. Ningún secreto viaja por Realtime.
--   * Las acciones críticas bloquean la fila de estado (SELECT ... FOR UPDATE)
--     para que sean atómicas aunque ambas interfaces actúen a la vez.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table public.games (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '¿Quién quiere casarse con Adri?',
  player_key  text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at  timestamptz not null default now()
);
create unique index games_one_per_host on public.games (host_id);

create table public.questions (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references public.games (id) on delete cascade,
  position        integer not null default 0,
  question_text   text not null check (char_length(question_text) between 1 and 400),
  answer_a        text not null check (char_length(answer_a) between 1 and 160),
  answer_b        text not null check (char_length(answer_b) between 1 and 160),
  answer_c        text not null check (char_length(answer_c) between 1 and 160),
  answer_d        text not null check (char_length(answer_d) between 1 and 160),
  correct_answer  smallint not null check (correct_answer between 0 and 3),
  category        text not null default 'General',
  difficulty      smallint not null default 1 check (difficulty between 1 and 5),
  prize           text not null default '',
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now()
);
create index questions_game_position on public.questions (game_id, position);

create table public.game_state (
  game_id             uuid primary key references public.games (id) on delete cascade,
  status              text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  question_index      integer not null default 0,
  selected_answer     smallint check (selected_answer between 0 and 3),
  answer_locked       boolean not null default false,
  answer_revealed     boolean not null default false,
  revealed_correct    smallint check (revealed_correct between 0 and 3),
  eliminated_answers  smallint[] not null default '{}',
  used_5050           boolean not null default false,
  used_call           boolean not null default false,
  used_challenge      boolean not null default false,
  active_lifeline     text check (active_lifeline in ('call', 'challenge')),
  call_status         text check (call_status in ('ringing', 'running', 'ended')),
  call_started_at     timestamptz,
  call_duration       integer not null default 30,
  challenge_text      text,
  challenge_status    text check (challenge_status in ('pending', 'shown', 'passed', 'failed')),
  results             jsonb not null default '[]'::jsonb,
  transition_seq      integer not null default 0,
  version             bigint not null default 0,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: solo el presentador propietario accede directamente a sus filas.
-- El rol anon no tiene ningún privilegio sobre las tablas.
-- ---------------------------------------------------------------------
alter table public.games      enable row level security;
alter table public.questions  enable row level security;
alter table public.game_state enable row level security;

revoke all on public.games, public.questions, public.game_state from anon;
revoke all on public.games, public.questions, public.game_state from authenticated;
grant select on public.games to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select on public.game_state to authenticated;

create policy "host reads own game" on public.games
  for select to authenticated using (host_id = (select auth.uid()));

create policy "host reads own questions" on public.questions
  for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and g.host_id = (select auth.uid())));
create policy "host inserts own questions" on public.questions
  for insert to authenticated
  with check (exists (select 1 from public.games g where g.id = game_id and g.host_id = (select auth.uid())));
create policy "host updates own questions" on public.questions
  for update to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and g.host_id = (select auth.uid())))
  with check (exists (select 1 from public.games g where g.id = game_id and g.host_id = (select auth.uid())));
create policy "host deletes own questions" on public.questions
  for delete to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and g.host_id = (select auth.uid())));

create policy "host reads own state" on public.game_state
  for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and g.host_id = (select auth.uid())));

-- ---------------------------------------------------------------------
-- Notificación en tiempo real (Broadcast desde la base de datos)
-- ---------------------------------------------------------------------
create or replace function public._qqc_notify(p_game_id uuid, p_version bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select player_key into v_key from public.games where id = p_game_id;
  if v_key is not null then
    perform realtime.send(
      jsonb_build_object('version', p_version, 'at', now()),
      'state',
      'qqc:' || v_key,
      false
    );
  end if;
end;
$$;

create or replace function public._qqc_state_bump()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := coalesce(old.version, 0) + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger game_state_bump
  before update on public.game_state
  for each row execute function public._qqc_state_bump();

create or replace function public._qqc_state_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._qqc_notify(new.game_id, new.version);
  return null;
end;
$$;

create trigger game_state_notify
  after insert or update on public.game_state
  for each row execute function public._qqc_state_notify();

-- Si el presentador edita preguntas, se avisa también (la pregunta actual
-- puede haber cambiado). Se incrementa la versión del estado.
create or replace function public._qqc_questions_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game uuid := coalesce(new.game_id, old.game_id);
begin
  update public.game_state set updated_at = now() where game_id = v_game;
  return null;
end;
$$;

create trigger questions_notify
  after insert or update or delete on public.questions
  for each row execute function public._qqc_questions_notify();

-- ---------------------------------------------------------------------
-- Utilidades internas
-- ---------------------------------------------------------------------
create or replace function public._qqc_question_at(p_game_id uuid, p_index integer)
returns public.questions
language sql
stable
security definer
set search_path = ''
as $$
  select q.* from public.questions q
  where q.game_id = p_game_id
  order by q.position, q.created_at, q.id
  offset greatest(p_index, 0) limit 1;
$$;

create or replace function public._qqc_assert_host(p_game_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.games where id = p_game_id and host_id = auth.uid()
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

-- Estado público (sin secretos). Lo usan jugador y presentador.
create or replace function public._qqc_public_state(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.game_state;
  q public.questions;
  v_total integer;
  v_ladder jsonb;
begin
  select * into s from public.game_state where game_id = p_game_id;
  if not found then
    return null;
  end if;

  select count(*) into v_total from public.questions where game_id = p_game_id;
  select coalesce(jsonb_agg(jsonb_build_object('prize', x.prize, 'difficulty', x.difficulty)
                             order by x.position, x.created_at, x.id), '[]'::jsonb)
    into v_ladder
    from public.questions x where x.game_id = p_game_id;

  q := public._qqc_question_at(p_game_id, s.question_index);

  return jsonb_build_object(
    'status', s.status,
    'questionIndex', s.question_index,
    'totalQuestions', v_total,
    'ladder', v_ladder,
    'question', case when q.id is null or s.status <> 'playing' then null else jsonb_build_object(
        'id', q.id,
        'text', q.question_text,
        'answers', jsonb_build_array(q.answer_a, q.answer_b, q.answer_c, q.answer_d),
        'category', q.category,
        'difficulty', q.difficulty,
        'prize', q.prize,
        'isSample', q.is_sample
      ) end,
    'selectedAnswer', s.selected_answer,
    'answerLocked', s.answer_locked,
    'answerRevealed', s.answer_revealed,
    -- La respuesta correcta SOLO se incluye tras la revelación.
    'correctAnswer', case when s.answer_revealed then s.revealed_correct else null end,
    'eliminatedAnswers', to_jsonb(s.eliminated_answers),
    'lifelines', jsonb_build_object('fifty', s.used_5050, 'call', s.used_call, 'challenge', s.used_challenge),
    'activeLifeline', s.active_lifeline,
    'call', jsonb_build_object('status', s.call_status, 'startedAt', s.call_started_at, 'duration', s.call_duration),
    'challenge', jsonb_build_object(
        'status', s.challenge_status,
        'text', case when s.challenge_status in ('shown', 'passed', 'failed') then s.challenge_text else null end
      ),
    'results', s.results,
    'correctCount', (select count(*) from jsonb_array_elements(s.results) r where (r ->> 'ok')::boolean),
    'transitionSeq', s.transition_seq,
    'version', s.version,
    'serverTime', now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- API del JUGADOR (rol anon). Requiere la clave secreta del enlace.
-- ---------------------------------------------------------------------
create or replace function public._qqc_game_by_key(p_key text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.games where player_key = p_key;
  if v_id is null then
    raise exception 'Partida no encontrada' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

create or replace function public.player_get_state(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public._qqc_public_state(public._qqc_game_by_key(p_key));
end;
$$;

create or replace function public.player_select_answer(p_key text, p_answer smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game uuid := public._qqc_game_by_key(p_key);
  s public.game_state;
begin
  if p_answer is null or p_answer not between 0 and 3 then
    raise exception 'Respuesta no válida';
  end if;
  select * into s from public.game_state where game_id = v_game for update;
  if s.status <> 'playing' then raise exception 'El concurso no está en juego'; end if;
  if s.answer_locked or s.answer_revealed then raise exception 'La respuesta ya está bloqueada'; end if;
  if s.active_lifeline is not null then raise exception 'Hay un comodín en curso'; end if;
  if p_answer = any (s.eliminated_answers) then raise exception 'Esa respuesta está eliminada'; end if;

  update public.game_state set selected_answer = p_answer where game_id = v_game;
  return public._qqc_public_state(v_game);
end;
$$;

create or replace function public.player_use_lifeline(p_key text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game uuid := public._qqc_game_by_key(p_key);
  s public.game_state;
  q public.questions;
  v_elim smallint[];
begin
  select * into s from public.game_state where game_id = v_game for update;
  if s.status <> 'playing' then raise exception 'El concurso no está en juego'; end if;
  if s.answer_locked or s.answer_revealed then raise exception 'La respuesta ya está bloqueada'; end if;
  if s.active_lifeline is not null then raise exception 'Ya hay un comodín en curso'; end if;

  if p_kind = 'fifty' then
    if s.used_5050 then raise exception 'Comodín ya utilizado'; end if;
    q := public._qqc_question_at(v_game, s.question_index);
    if q.id is null then raise exception 'No hay pregunta activa'; end if;
    -- Dos respuestas incorrectas al azar entre las tres incorrectas.
    select array_agg(a order by a) into v_elim from (
      select a from unnest(array[0, 1, 2, 3]::smallint[]) as a
      where a <> q.correct_answer
      order by random()
      limit 2
    ) t;
    update public.game_state
       set used_5050 = true,
           eliminated_answers = v_elim,
           selected_answer = case when selected_answer = any (v_elim) then null else selected_answer end
     where game_id = v_game;
  elsif p_kind = 'call' then
    if s.used_call then raise exception 'Comodín ya utilizado'; end if;
    update public.game_state
       set used_call = true, active_lifeline = 'call', call_status = 'ringing', call_started_at = null
     where game_id = v_game;
  elsif p_kind = 'challenge' then
    if s.used_challenge then raise exception 'Comodín ya utilizado'; end if;
    update public.game_state
       set used_challenge = true, active_lifeline = 'challenge', challenge_status = 'pending', challenge_text = null
     where game_id = v_game;
  else
    raise exception 'Comodín desconocido';
  end if;
  return public._qqc_public_state(v_game);
end;
$$;

-- ---------------------------------------------------------------------
-- API del PRESENTADOR (rol authenticated, propietario de la partida)
-- ---------------------------------------------------------------------

-- Crea (una sola vez) la partida del presentador con preguntas de PRUEBA.
create or replace function public.host_ensure_game()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_game uuid;
begin
  if v_uid is null then raise exception 'No autorizado' using errcode = '42501'; end if;
  select id into v_game from public.games where host_id = v_uid;
  if v_game is not null then
    insert into public.game_state (game_id) values (v_game) on conflict do nothing;
    return v_game;
  end if;

  insert into public.games (host_id) values (v_uid) returning id into v_game;

  insert into public.questions (game_id, position, question_text, answer_a, answer_b, answer_c, answer_d, correct_answer, category, difficulty, prize, is_sample) values
  (v_game, 1, '[PRUEBA] ¿Qué se suele lanzar a los novios a la salida de la ceremonia?', 'Arroz o pétalos', 'Confeti de oficina', 'Cubitos de hielo', 'Monedas de chocolate', 0, 'Tradiciones', 1, 'Un brindis', true),
  (v_game, 2, '[PRUEBA] ¿En qué dedo se lleva tradicionalmente el anillo de compromiso en España?', 'Pulgar', 'Índice', 'Anular', 'Meñique', 2, 'Tradiciones', 1, 'Un baile', true),
  (v_game, 3, '[PRUEBA] ¿Cómo se llama el viaje que hacen los recién casados después de la boda?', 'Luna de miel', 'Sol de azúcar', 'Ruta del arroz', 'Escapada nupcial exprés', 0, 'Bodas', 1, 'Un ramo de flores', true),
  (v_game, 4, '[PRUEBA] ¿Qué aniversario de boda se asocia con las bodas de plata?', '10 años', '25 años', '40 años', '50 años', 1, 'Bodas', 2, 'Una cena romántica', true),
  (v_game, 5, '[PRUEBA] ¿Qué piedra preciosa es la más habitual en un anillo de compromiso?', 'Esmeralda', 'Rubí', 'Zafiro', 'Diamante', 3, 'Amor', 2, 'Una escapada', true),
  (v_game, 6, '[PRUEBA] ¿Qué se dice que trae buena suerte a la novia, según la tradición anglosajona?', 'Algo viejo, algo nuevo, algo prestado y algo azul', 'Tres monedas y un trébol', 'Un zapato rojo', 'Un paraguas abierto', 0, 'Tradiciones', 3, 'Una noche de hotel', true),
  (v_game, 7, '[PRUEBA] ¿Qué ciudad es famosa por sus bodas exprés en capillas?', 'Viena', 'Las Vegas', 'Oslo', 'Lisboa', 1, 'Cultura', 3, 'Un viaje sorpresa', true),
  (v_game, 8, '[PRUEBA] ¿Cuál de estas canciones de amor NO es un pasodoble?', 'Una canción pop de los 2000', 'España cañí', 'Paquito el chocolatero', 'Suspiros de España', 0, 'Música', 4, 'Un anillo de oro', true),
  (v_game, 9, '[PRUEBA] ¿Qué aniversario de boda se celebra a los 50 años?', 'Bodas de cristal', 'Bodas de rubí', 'Bodas de oro', 'Bodas de papel', 2, 'Bodas', 4, 'La luna de miel', true),
  (v_game, 10, '[PRUEBA] ¿Qué frase se pronuncia tradicionalmente en el altar para aceptar el matrimonio?', '«Ya veremos»', '«Sí, quiero»', '«Lo pensaré»', '«Pregunta otra vez»', 1, 'Gran final', 5, '¡CASARSE CON ADRI!', true);

  insert into public.game_state (game_id) values (v_game);
  return v_game;
end;
$$;

create or replace function public.host_get_state(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.game_state;
  q public.questions;
  g public.games;
begin
  perform public._qqc_assert_host(p_game_id);
  select * into g from public.games where id = p_game_id;
  select * into s from public.game_state where game_id = p_game_id;
  q := public._qqc_question_at(p_game_id, s.question_index);
  return public._qqc_public_state(p_game_id) || jsonb_build_object(
    'gameId', g.id,
    'playerKey', g.player_key,
    'hostCorrectAnswer', q.correct_answer,
    'hostQuestion', case when q.id is null then null else jsonb_build_object(
        'id', q.id,
        'text', q.question_text,
        'answers', jsonb_build_array(q.answer_a, q.answer_b, q.answer_c, q.answer_d),
        'category', q.category,
        'difficulty', q.difficulty,
        'prize', q.prize,
        'isSample', q.is_sample
      ) end,
    'hostChallengeText', s.challenge_text
  );
end;
$$;

create or replace function public.host_start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._qqc_assert_host(p_game_id);
  if not exists (select 1 from public.questions where game_id = p_game_id) then
    raise exception 'Añade al menos una pregunta antes de empezar';
  end if;
  update public.game_state set
    status = 'playing', question_index = 0, selected_answer = null, answer_locked = false,
    answer_revealed = false, revealed_correct = null, eliminated_answers = '{}',
    active_lifeline = null, call_status = null, call_started_at = null,
    challenge_status = null, challenge_text = null, results = '[]'::jsonb,
    transition_seq = transition_seq + 1
  where game_id = p_game_id;
end;
$$;

create or replace function public.host_set_lock(p_game_id uuid, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.game_state;
begin
  perform public._qqc_assert_host(p_game_id);
  select * into s from public.game_state where game_id = p_game_id for update;
  if s.status <> 'playing' then raise exception 'El concurso no está en juego'; end if;
  if s.answer_revealed then raise exception 'La respuesta ya se ha revelado'; end if;
  if p_locked and s.selected_answer is null then raise exception 'Paula todavía no ha elegido respuesta'; end if;
  update public.game_state set answer_locked = p_locked where game_id = p_game_id;
end;
$$;

create or replace function public.host_reveal(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.game_state;
  q public.questions;
begin
  perform public._qqc_assert_host(p_game_id);
  select * into s from public.game_state where game_id = p_game_id for update;
  if s.status <> 'playing' then raise exception 'El concurso no está en juego'; end if;
  if s.answer_revealed then raise exception 'La respuesta ya se ha revelado'; end if;
  if s.selected_answer is null then raise exception 'Paula todavía no ha elegido respuesta'; end if;
  if s.active_lifeline is not null then raise exception 'Termina primero el comodín en curso'; end if;
  q := public._qqc_question_at(p_game_id, s.question_index);
  if q.id is null then raise exception 'No hay pregunta activa'; end if;

  update public.game_state set
    answer_locked = true,
    answer_revealed = true,
    revealed_correct = q.correct_answer,
    results = (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(s.results) r
      where (r ->> 'index')::int <> s.question_index
    ) || jsonb_build_array(jsonb_build_object(
      'index', s.question_index,
      'selected', s.selected_answer,
      'correct', q.correct_answer,
      'ok', s.selected_answer = q.correct_answer,
      'prize', q.prize
    ))
  where game_id = p_game_id;
end;
$$;

create or replace function public.host_next_question(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.game_state;
  v_total integer;
begin
  perform public._qqc_assert_host(p_game_id);
  select * into s from public.game_state where game_id = p_game_id for update;
  if s.status <> 'playing' then raise exception 'El concurso no está en juego'; end if;
  if not s.answer_revealed then raise exception 'Revela antes la respuesta'; end if;
  select count(*) into v_total from public.questions where game_id = p_game_id;

  if s.question_index + 1 >= v_total then
    update public.game_state set status = 'finished', active_lifeline = null,
      transition_seq = transition_seq + 1
    where game_id = p_game_id;
  else
    update public.game_state set
      question_index = s.question_index + 1, selected_answer = null, answer_locked = false,
      answer_revealed = false, revealed_correct = null, eliminated_answers = '{}',
      active_lifeline = null, call_status = case when used_call then 'ended' else null end,
      challenge_status = case when used_challenge then challenge_status else null end,
      transition_seq = transition_seq + 1
    where game_id = p_game_id;
  end if;
end;
$$;

create or replace function public.host_reset_question(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.game_state;
begin
  perform public._qqc_assert_host(p_game_id);
  select * into s from public.game_state where game_id = p_game_id for update;
  -- Los comodines gastados siguen gastados (y el 50:50 aplicado se mantiene).
  update public.game_state set
    status = case when status = 'finished' then 'playing' else status end,
    selected_answer = null, answer_locked = false, answer_revealed = false, revealed_correct = null,
    active_lifeline = null,
    results = (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(s.results) r
      where (r ->> 'index')::int <> s.question_index
    )
  where game_id = p_game_id;
end;
$$;

create or replace function public.host_reset_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._qqc_assert_host(p_game_id);
  update public.game_state set
    status = 'lobby', question_index = 0, selected_answer = null, answer_locked = false,
    answer_revealed = false, revealed_correct = null, eliminated_answers = '{}',
    used_5050 = false, used_call = false, used_challenge = false,
    active_lifeline = null, call_status = null, call_started_at = null,
    challenge_status = null, challenge_text = null, results = '[]'::jsonb,
    transition_seq = transition_seq + 1
  where game_id = p_game_id;
end;
$$;

create or replace function public.host_finish_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._qqc_assert_host(p_game_id);
  update public.game_state set status = 'finished', active_lifeline = null,
    transition_seq = transition_seq + 1
  where game_id = p_game_id;
end;
$$;

-- Gestión de la llamada y de la prueba por parte del presentador.
create or replace function public.host_lifeline(p_game_id uuid, p_action text, p_text text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.game_state;
begin
  perform public._qqc_assert_host(p_game_id);
  select * into s from public.game_state where game_id = p_game_id for update;

  case p_action
    when 'call_start' then
      if s.active_lifeline is distinct from 'call' then raise exception 'La llamada no está activa'; end if;
      update public.game_state set call_status = 'running', call_started_at = now(),
        call_duration = coalesce(nullif(p_text, '')::int, 30)
      where game_id = p_game_id;
    when 'call_end' then
      update public.game_state set call_status = 'ended',
        active_lifeline = case when active_lifeline = 'call' then null else active_lifeline end
      where game_id = p_game_id;
    when 'challenge_show' then
      if s.active_lifeline is distinct from 'challenge' then raise exception 'La prueba no está activa'; end if;
      if coalesce(trim(p_text), '') = '' then raise exception 'Escribe el reto'; end if;
      update public.game_state set challenge_text = left(trim(p_text), 500), challenge_status = 'shown'
      where game_id = p_game_id;
    when 'challenge_pass' then
      update public.game_state set challenge_status = 'passed' where game_id = p_game_id;
    when 'challenge_fail' then
      update public.game_state set challenge_status = 'failed' where game_id = p_game_id;
    when 'challenge_close' then
      update public.game_state set
        active_lifeline = case when active_lifeline = 'challenge' then null else active_lifeline end
      where game_id = p_game_id;
    -- Corrección manual por si alguien pulsa un comodín por error.
    when 'restore_fifty' then
      update public.game_state set used_5050 = false, eliminated_answers = '{}' where game_id = p_game_id;
    when 'restore_call' then
      update public.game_state set used_call = false, call_status = null, call_started_at = null,
        active_lifeline = case when active_lifeline = 'call' then null else active_lifeline end
      where game_id = p_game_id;
    when 'restore_challenge' then
      update public.game_state set used_challenge = false, challenge_status = null, challenge_text = null,
        active_lifeline = case when active_lifeline = 'challenge' then null else active_lifeline end
      where game_id = p_game_id;
    else
      raise exception 'Acción desconocida';
  end case;
end;
$$;

create or replace function public.host_reorder_questions(p_game_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._qqc_assert_host(p_game_id);
  update public.questions q set position = t.ord
  from unnest(p_ids) with ordinality as t(id, ord)
  where q.id = t.id and q.game_id = p_game_id;
end;
$$;

-- Nueva clave de jugador (invalida el enlace anterior).
create or replace function public.host_rotate_player_key(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  perform public._qqc_assert_host(p_game_id);
  update public.games set player_key = v_key where id = p_game_id;
  return v_key;
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.player_get_state(text) to anon, authenticated;
grant execute on function public.player_select_answer(text, smallint) to anon, authenticated;
grant execute on function public.player_use_lifeline(text, text) to anon, authenticated;

grant execute on function public.host_ensure_game() to authenticated;
grant execute on function public.host_get_state(uuid) to authenticated;
grant execute on function public.host_start_game(uuid) to authenticated;
grant execute on function public.host_set_lock(uuid, boolean) to authenticated;
grant execute on function public.host_reveal(uuid) to authenticated;
grant execute on function public.host_next_question(uuid) to authenticated;
grant execute on function public.host_reset_question(uuid) to authenticated;
grant execute on function public.host_reset_game(uuid) to authenticated;
grant execute on function public.host_finish_game(uuid) to authenticated;
grant execute on function public.host_lifeline(uuid, text, text) to authenticated;
grant execute on function public.host_reorder_questions(uuid, uuid[]) to authenticated;
grant execute on function public.host_rotate_player_key(uuid) to authenticated;

-- Las funciones internas no se exponen.
alter default privileges in schema public revoke execute on functions from public, anon;
