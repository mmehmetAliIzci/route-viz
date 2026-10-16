import { parsePlan } from './planApi'
import contract from '../test/plan-contract.json'

// The backend writes plan-contract.json from a recorded plan (backend/tests/test_contract.py).
// Zod drops keys it does not know, so a parse that loses nothing means the two sides agree.
describe('plan contract with the backend', () => {
  it('parses the backend plan without losing or changing a field', () => {
    expect(parsePlan(contract)).toEqual(contract)
  })
})
