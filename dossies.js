// Conteúdo do menu "Dossiês" (texto fixo do site).
// Escrito por 4 "escritores" com ângulos diferentes, avaliado por um júri e verificado contra factos
// inventados; só usa factos reais (números do índice, fotos dadas pelo inspector).
import { TEXTOS } from './jogo-textos.js';
import { TEXTOS as TOQUES } from './toques-textos.js';
import { TEXTOS as SOFA } from './sofa-textos.js';

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const DOSSIES = [
  {
    "id": "sobre",
    "emoji": "📁",
    "label": "Sobre o casamento",
    "tab": "Confidencial",
    "title": "Processo n.º 0506/2026: Relatório Final",
    "html": "<p>Aos 5 dias do mês de junho de 2026, a Inês e o Ricardo casaram-se. Aberto o inquérito, apurou-se que os suspeitos não ofereceram resistência. Pelo contrário: convidaram testemunhas. Missão: identificá-las a todas.</p><p><b>DAS PROVAS.</b> O Inspector Xinxers (alcunha atribuída pelo próprio noivo, facto que o inspector exige que fique registado) apreendeu 1.788 fotografias, arquivadas no processo &quot;Inês&amp;Ricardo&quot;. A perícia facial detetou 8.750 caras. Em 1.672 fotos há pelo menos um suspeito; nas restantes 116 não se encontrou ninguém. Hipóteses em aberto: arte contemporânea ou convidados de costas (o algoritmo não reconhece nucas). A foto mais concorrida junta 39 caras: densidade superior à de um autocarro em hora de ponta, e com muito melhor roupa.</p><p><b>DA PERÍCIA.</b> A Inês aparece em 501 fotos; o Ricardo, em 499. Um empate técnico que a perícia analisou com toda a seriedade, e a conclusão é unânime: a noiva ganhou por duas fotos, e o noivo já pediu recontagem. Aparecem juntos em 255. Nas restantes, a perícia admite que andassem simplesmente à procura um do outro.</p><p><b>DOS ANTECEDENTES.</b> Consultado o arquivo, o noivo tem cadastro: fotografia antiga com casaco branco, camisa havaiana azul, óculos de sol brancos do tamanho de duas antenas parabólicas, bigode e pera pintados, cabelo à tigela e um dente pintado de preto. A ficha continua ativa: basta ele tirar uma selfie na app para ela aparecer. Não foi possível apurar se a noiva teve acesso a esta prova antes do casamento. Se teve, e casou na mesma, a investigação dá o amor como provado, para além de qualquer dúvida razoável.</p><p><b>AUTO DE OCORRÊNCIA.</b> Durante o copo-d&#x27;água, o próprio inspector foi localizado num pátio de paredes brancas e barras azuis, deitado numa cadeira de madeira, de óculos escuros, mãos cruzadas e sapatos castanhos pousados numa mesa baixa. Interrogado, confessou ter bebido demais. A porta vermelha, testemunha principal, recusou prestar declarações.</p><p><b>DILIGÊNCIAS FINAIS.</b> Falta identificar as testemunhas, e é aí que entras tu. Tira uma selfie (vai, vai, Xinxers-câmara!), a app procura-te nas 1.788 provas e o Xinxers-zip entrega-te todas as fotos em que apareces, num só ficheiro, isento de custas.</p><p>Este relatório autodestrói-se em cinco segundos. Se ainda o estás a ler, o gadget avariou. Arquive-se.</p>"
  },
  {
    "id": "direitos-do-convidado",
    "emoji": "⚖️",
    "label": "Direitos do Convidado",
    "title": "Direitos do Convidado",
    "html": "<p>Tens o direito de permanecer em silêncio. Tudo o que disseres pode ser usado contra ti. Tudo o que fizeste com a cara já foi usado: está nas fotos. Tens ainda direito a um .zip e a fingir que não viste metade delas.</p>"
  },
  {
    "id": "livro-de-reclama-es",
    "emoji": "📕",
    "label": "Livro de Reclamações",
    "title": "Livro de Reclamações",
    "html": "<p>Assinala o motivo da queixa: □ apareço em poucas fotos; □ apareço em demasiadas; □ sou uma das 39 caras e não era o meu lado bom; □ sou o noivo e exijo a recontagem das 2 fotos que a noiva tem a mais (prioridade máxima). Todas as queixas seguem para o inspector, que não comenta processos em que é arguido.</p>"
  },
  {
    "id": "apoio-t-cnico",
    "emoji": "🛠️",
    "label": "Apoio Técnico",
    "title": "Apoio Técnico",
    "html": "<p>A app não te encontra? 1) Tira os óculos de sol. 2) Limpa a câmara do telemóvel. 3) Confirma que foste mesmo ao casamento. 4) Já experimentaste desligar e voltar a ligar? O inspector experimentou no copo-d&#x27;água e ainda está a reiniciar.</p>"
  },
  {
    "id": "achados-e-perdidos",
    "emoji": "🧳",
    "label": "Achados e Perdidos",
    "title": "Achados e Perdidos",
    "html": "<p>Perdido: um dente do noivo, na foto de cadastro. Alarme falso: era tinta preta. Achados: dois sapatos castanhos em cima de uma mesa baixa, ainda com o inspector lá dentro. Perdido para sempre: o álibi de quem diz que não foi ao casamento.</p>"
  },
  {
    "id": "termos-e-condi-es",
    "emoji": "📜",
    "label": "Termos e Condições",
    "title": "Termos e Condições",
    "html": "<p>Ao tirares uma selfie, autorizas que a tua cara seja comparada com as de toda a gente que lá esteve, sem direito a escolher o teu melhor perfil. O algoritmo não julga. O inspector julga, mas está deitado. Não aceitar estes termos equivale a aceitá-los.</p>"
  },
  {
    "id": "procurado",
    "emoji": "🕵️",
    "label": "PROCURADO",
    "title": "PROCURADO",
    "action": "wanted",
    "text": "Indivíduo de chapéu, gabardina e lupa, com braços-gadget equipados com câmara, hélice e lanterna. Acusado de recolha de caras sem mandado. Agravante: é amigo do noivo. Recompensa: um .zip com todas as tuas fotos."
  },
  {
    "id": "ressaca",
    "emoji": "🥴",
    "label": "Modo ressaca",
    "action": "ressaca"
  },
  {
    id: 'jogo',
    emoji: '🍾',
    label: `Jogar: ${TEXTOS.nome_jogo}`,
    action: 'jogo',
    target: 'jogo'
  },
  {
    id: 'toques',
    emoji: '⚽',
    label: `Jogar: ${TOQUES.nome_jogo}`,
    action: 'jogo',
    target: 'toques'
  },
  {
    id: 'sofa',
    emoji: '🛋️',
    label: `Jogar: ${SOFA.nome_jogo}`,
    action: 'jogo',
    target: 'sofa'
  },
  {
    id: 'regulamento',
    emoji: '🏆',
    label: 'Regulamento do passatempo',
    tab: 'Passatempo',
    title: 'Regulamento do passatempo',
    html: TEXTOS.regulamento.map((r) => `<p>${esc(r)}</p>`).join('')
  },
  {
    id: 'regulamento-toques',
    emoji: '🎬',
    label: 'Regulamento do casting',
    tab: 'Repescagem',
    title: 'Regulamento do casting',
    html: TOQUES.regulamento.map((r) => `<p>${esc(r)}</p>`).join('')
  },
  {
    id: 'regulamento-sofa',
    emoji: '🥃',
    label: 'Regulamento do sofá',
    tab: 'Auto de ocorrência',
    title: 'Regulamento do sofá',
    html: SOFA.regulamento.map((r) => `<p>${esc(r)}</p>`).join('')
  }
];
