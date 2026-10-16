import { getSample, postPlan, type TripInput } from './planApi'
import fixture from '../test/plan-kc-den.json'

const trip: TripInput = {
  origin: { label: 'Kansas City, MO', lat: 39.1, lon: -94.58 },
  destination: { label: 'Denver, CO', lat: 39.74, lon: -104.99 },
  departure_utc: '2026-10-16T14:00:00Z',
  load_lb: 38_000,
  spacing_mi: 25,
}

function stubFetch() {
  const fetchStub = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(fixture)))
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

afterEach(() => vi.unstubAllGlobals())

describe('viewer time zone', () => {
  it('sends the browser zone with a plan request', async () => {
    const fetchStub = stubFetch()
    await postPlan(trip)
    const init = fetchStub.mock.calls[0]?.[1]
    expect(JSON.parse(String(init?.body))).toEqual({ ...trip, viewer_tz: 'America/Chicago' })
  })

  it('sends the browser zone when opening a saved trip', async () => {
    const fetchStub = stubFetch()
    await getSample('kc-den')
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/api/samples/kc-den?tz=America%2FChicago')
  })
})
