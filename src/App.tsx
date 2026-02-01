import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import CardsPage from './pages/CardsPage'
import CardDetailPage from './pages/CardDetailPage'
import DecksPage from './pages/DecksPage'
import DeckDetailPage from './pages/DeckDetailPage'
import DeckDetailPageV2 from './pages/DeckDetailPageV2'
import Game8DeckPage from './pages/Game8DeckPage'
import DeckGuidePage from './pages/DeckGuidePage'
import MarkdownDeckPage from './pages/MarkdownDeckPage'
import ComboTestPage from './pages/ComboTestPage'
import ArchetypeDetailPage from './pages/ArchetypeDetailPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="cards" element={<CardsPage />} />
          <Route path="cards/:cardId" element={<CardDetailPage />} />
          <Route path="decks" element={<DecksPage />} />
          <Route path="decks/:deckId" element={<DeckDetailPage />} />
          <Route path="v2/:deckId" element={<DeckDetailPageV2 />} />
          <Route path="game8/:deckId" element={<Game8DeckPage />} />
          <Route path="guide/:deckId" element={<DeckGuidePage />} />
          <Route path="md/:deckId" element={<MarkdownDeckPage />} />
          <Route path="combo-test" element={<ComboTestPage />} />
          <Route path="archetype/:archetypeId" element={<ArchetypeDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
