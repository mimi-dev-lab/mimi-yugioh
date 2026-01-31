import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import CardsPage from './pages/CardsPage'
import CardDetailPage from './pages/CardDetailPage'
import DecksPage from './pages/DecksPage'
import DeckDetailPage from './pages/DeckDetailPage'
import Game8DeckPage from './pages/Game8DeckPage'
import DeckGuidePage from './pages/DeckGuidePage'

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
          <Route path="game8/:deckId" element={<Game8DeckPage />} />
          <Route path="guide/:deckId" element={<DeckGuidePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
