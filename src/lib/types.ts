export type GameStatus = 'lobby' | 'playing' | 'finished'
export type LifelineKind = 'fifty' | 'call' | 'challenge'

export interface PublicQuestion {
  id: string
  text: string
  answers: [string, string, string, string]
  category: string
  difficulty: number
  prize: string
  isSample: boolean
}

export interface QuestionResult {
  index: number
  selected: number
  correct: number
  ok: boolean
  prize: string
}

export interface PublicState {
  status: GameStatus
  questionIndex: number
  totalQuestions: number
  ladder: { prize: string; difficulty: number }[]
  question: PublicQuestion | null
  selectedAnswer: number | null
  answerLocked: boolean
  answerRevealed: boolean
  /** Solo llega del servidor una vez revelada la respuesta. */
  correctAnswer: number | null
  eliminatedAnswers: number[]
  lifelines: { fifty: boolean; call: boolean; challenge: boolean }
  activeLifeline: 'call' | 'challenge' | null
  call: { status: 'ringing' | 'running' | 'ended' | null; startedAt: string | null; duration: number }
  challenge: { status: 'pending' | 'shown' | 'passed' | 'failed' | null; text: string | null }
  results: QuestionResult[]
  correctCount: number
  transitionSeq: number
  version: number
  serverTime: string
}

export interface HostState extends PublicState {
  gameId: string
  playerKey: string
  hostCorrectAnswer: number | null
  hostQuestion: PublicQuestion | null
  hostChallengeText: string | null
}

export interface QuestionRow {
  id: string
  game_id: string
  position: number
  question_text: string
  answer_a: string
  answer_b: string
  answer_c: string
  answer_d: string
  correct_answer: number
  category: string
  difficulty: number
  prize: string
  is_sample: boolean
  created_at: string
}

export const LETTERS = ['A', 'B', 'C', 'D'] as const
