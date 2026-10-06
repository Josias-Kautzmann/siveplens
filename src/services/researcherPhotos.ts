/**
 * Fotos dos pesquisadores — mapeamento manual.
 *
 * Como adicionar:
 * 1. Acesse /noticias → Artigos Científicos → Pesquisadores
 * 2. Clique no card do pesquisador (abre OpenAlex)
 * 3. Copie o ID da URL: https://openalex.org/A123456
 * 4. Busque a foto no Google Scholar, Lattes, ResearchGate ou página institucional
 * 5. Adicione abaixo: "https://openalex.org/A123456": "https://url-da-foto.jpg"
 *
 * A foto deve ser acessível publicamente (sem autenticação).
 */
export const RESEARCHER_PHOTOS: Record<string, string> = {
  // Fotos salvas em public/researchers/{nome}.jpg
  "https://openalex.org/A5076649706": "/researchers/fernando-bozza.jpg",        // Fernando A. Bozza
  "https://openalex.org/A5012339002": "/researchers/mihaela-van-der-schaar.jpg", // Mihaela van der Schaar
  "https://openalex.org/A5027793258": "/researchers/ari-ercole.jpg",             // Ari Ercole
  "https://openalex.org/A5045686938": "/researchers/kris-parag.jpg",             // Kris V. Parag
  "https://openalex.org/A5003418812": "/researchers/otavio-ranzani.jpg",         // Otávio T. Ranzani
  "https://openalex.org/A5084556203": "/researchers/rafael-pereira.jpg",         // Rafael H. M. Pereira
  "https://openalex.org/A5042960232": "/researchers/william-souza.jpg",          // William Marciel de Souza
  "https://openalex.org/A5023336304": "/researchers/alexander-zarebski.jpg",     // Alexander E. Zarebski
  "https://openalex.org/A5091179101": "/researchers/valerio-marra.jpg",          // Valerio Marra
  "https://openalex.org/A5005846282": "/researchers/carlos-prete.jpg",           // Carlos A. Prete
  "https://openalex.org/A5060019659": "/researchers/darlan-candido.jpg",         // Darlan da Silva Cândido
  "https://openalex.org/A5091818356": "/researchers/lewis-buss.jpg",             // Lewis Buss
  "https://openalex.org/A5045641650": "/researchers/silvio-hamacher.jpg",        // Sílvio Hamacher
  "https://openalex.org/A5025283144": "/researchers/andreza-santos.jpg",         // Andreza Aruska de Souza Santos
  "https://openalex.org/A5006610847": "/researchers/ioana-bica.jpg",             // Ioana Bica
  "https://openalex.org/A5060933776": "/researchers/fernanda-baiao.jpg",         // Fernanda Baião
  "https://openalex.org/A5047998444": "/researchers/jean-paul-carrera.jpg",      // Jean-Paul Carrera
  "https://openalex.org/A5011074356": "/researchers/maria-vincenti-gonzalez.jpg", // María F. Vincenti-González
  "https://openalex.org/A5024554717": "/researchers/sabrina-li.jpg",             // Sabrina Li
};
