import { config } from 'dotenv'
import populateEnv from 'populate-env'

config()

export let env = {
  PORT: 8100,
  CLASSIFICATION_DIFFICULTY: 1,
  TRAINING_RATIO: 0.8,
}

populateEnv(env, { mode: 'halt' })
