import './index.css'
import Battlefield from './components/Battlefield'

function App() {
  return (
    <div className="min-h-screen w-full p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-3xl font-bold">Slay AI — Prototype</h1>
        <p className="text-sm text-neutral-400">
          Turn-based, deck-driven combat. Select a character to take a turn, draw 3, and play cards.
        </p>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <Battlefield />
        </div>
      </div>
    </div>
  )
}

export default App
