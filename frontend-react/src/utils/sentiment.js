/**
 * utils/sentiment.js
 * 
 * - Replace old inline color function with auxiliary function for emotion mapping.
 */


// defines 6 emotions with their corresponding colors and labels. 
// object contains 4 properties { key, label, background, text }
export const EMOTIONS = {
  excitement: { key: 'excitement', label: 'Excitement', background: '#F2C14E', text: '#1F2233' },
  happiness:  { key: 'happiness',  label: 'Happiness',  background: '#86C4A2', text: '#1F2233' },
  sadness:    { key: 'sadness',    label: 'Sadness',    background: '#7B9CD1', text: '#FFFFFF' },
  surprise:   { key: 'surprise',   label: 'Surprise',   background: '#D6A4D6', text: '#1F2233' },
  anger:      { key: 'anger',      label: 'Anger',      background: '#D97A6A', text: '#1F2233' },
  neutral:    { key: 'neutral',    label: 'Neutral',    background: '#A5ADBF', text: '#1F2233' },
}

// determines emotions for color guide in menu
export const EMOTION_ORDER = ['excitement', 'happiness', 'sadness', 'surprise', 'anger', 'neutral']


// normalize different sentiment lables to one of the 6 emotions.
const EMOTION_ALIASES = {
  excitement: 'excitement',
  excited: 'excitement',
  happiness: 'happiness',
  happy: 'happiness',
  joy: 'happiness',
  love: 'happiness',
  positive: 'happiness',
  sadness: 'sadness',
  sad: 'sadness',
  fear: 'sadness',
  surprise: 'surprise',
  surprised: 'surprise',
  anger: 'anger',
  angry: 'anger',
  disgust: 'anger',
  negative: 'anger',
  neutral: 'neutral',
}

// threshold for low confidence; prediction is treated as unreliable
const LOW_CONFIDENCE = 0.45


// analyze text for cues that help determine the emotion key.
// a. shouting            : text is in all caps and contains at least 4 letters
// b. exclamation marks   : number of '!' characters in the text
// c. question marks      : number of '?' characters in the text
// d. interrobang         : presence of '??', '?!', or '!?' in the text
// e. intense             : shouting or more than one exclamation mark
function textCues(text) {
  const raw = String(text || '')
  const letters = raw.replace(/[^a-z]/gi, '')
  const upper = letters.replace(/[^A-Z]/g, '').length
  const shouting = letters.length >= 4 && upper / letters.length > 0.6
  const exclaim = (raw.match(/!/g) || []).length
  const question = (raw.match(/\?/g) || []).length
  return {
    shouting,
    exclaim,
    question,
    // "???", "?!", "!?" 
    interrobang: /[?!]{2,}/.test(raw) || (question > 0 && exclaim > 0),
    // shouting,  "!"
    intense: shouting || exclaim > 1,
  }
}



// expand previous 3-class model to 6 emotions based on text cues and confidence.
// label_2 : positive sentiment -> excitement or happiness
// label_0 : negative sentiment -> anger or sadness
// label_1 : neutral sentiment  -> neutral or surprise
function mapSentimentToEmotion(label, score, text) {
  const cues = textCues(text)

  if (score < LOW_CONFIDENCE) {
    return cues.interrobang ? 'surprise' : 'neutral'
  }

  switch (label) {
    case 'LABEL_2': // positive
      return cues.intense ? 'excitement' : 'happiness'
    case 'LABEL_0': // negative
      return cues.intense || cues.interrobang ? 'anger' : 'sadness'
    case 'LABEL_1': // neutral
    default:
      return cues.interrobang ? 'surprise' : 'neutral'
  }
}


// take the sentiment and text as input and returns a emotion such as 'excitement' or 'happiness'
export function getEmotionKey(sentiment, text = '') {
  const label = String(sentiment?.label ?? '').trim()
  const score = Number.parseFloat(sentiment?.score)
  const confidence = Number.isFinite(score) ? Math.min(Math.max(score, 0), 1) : 0.5

  if (!label) return 'neutral'

  if (/^LABEL_[012]$/.test(label)) {
    return mapSentimentToEmotion(label, confidence, text)
  }

  return EMOTION_ALIASES[label.toLowerCase()] || 'neutral'
}


// returns a complete emotion entry {key, label, background, text}
export function getEmotion(sentiment, text = '') {
  return EMOTIONS[getEmotionKey(sentiment, text)]
}

// returns the background color of the emotion
export function getSentimentColor(sentiment, text = '') {
  return getEmotion(sentiment, text).background
}
