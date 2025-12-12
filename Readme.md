# NAV-BOT

## Status
This document defines NAV-BOT’s core concept, theory of change, and MVP scope.  
It is a living reference, not a finalized implementation.

---

## What is NAV-BOT?

NAV-BOT helps students build healthier cognitive defaults over time by interrupting maladaptive coping patterns and guiding them toward more reflective, prefrontal-based responses when stress arises.

NAV-BOT helps young adults practice healthier ways of responding to stress so those responses become easier and more automatic over time.

NAV-BOT reduces how often stress teaches the brain that avoidance, self-attack, or shutdown are the safest options.

---

## 1. Base Layer (Always On): Safe Venting Space

This is the foundation, not a side feature.

**Design principles**
- Bright, Gen-Z-friendly UI  
- Sentiment-colored message bubbles  
- GPT + Rasa for conversation and intent / pattern detection  
- No pressure to “do” anything  

**User behavior**
- Users can talk freely  
- Dump thoughts  
- Journal  
- Reflect  

**Value this layer provides**
- Emotional containment  
- Self-expression  
- Pattern visibility over time  

This makes NAV-BOT safe and approachable — not a productivity cop.

---

## 2. Pattern Awareness (Consent-Based)

Patterns appear naturally in chat.

NAV-BOT listens for:
- Avoidance  
- Catastrophizing  
- Rumination  
- Overwhelm  
- Shutdown / distraction language  

NAV-BOT does **not** interrupt randomly.  
It intervenes **only when a recognizable pattern appears**.

### Consent-first interruption

NAV-BOT might say:

> “I’m noticing a pattern that often shows up when people feel overwhelmed.  
> Do you want help working through it, or do you want to just keep venting?”

**Why this matters**
- The user stays in control  
- No therapy overreach  
- Minimal resistance  

Once consent is given, NAV-BOT selects the appropriate tool.

---

## What University Students Actually Struggle With (Problem Space)

### A. Academic Pressure
- Procrastination  
- Imposter syndrome  
- Test anxiety  
- Burnout  
- Perfectionism  
- Overwhelm from deadlines  
- Fear of failure  

### B. Emotional Health
- Anxiety (general + social)  
- Depression symptoms  
- Loneliness  
- Rumination  
- Negative self-talk  
- Unstable routines  

### C. Executive Function (Brain-Based)
Common challenges among Gen-Z students:
- Working memory overload  
- Task switching fatigue  
- Attention dysregulation  
- Planning difficulty  
- Reward-system dependency for motivation  

Often overlaps with ADHD tendencies (including undiagnosed).

### D. Identity & Social Stress
- Balancing independence with academic pressure  
- Relationships  
- Rejection sensitivity  
- Homesickness  
- Lack of life structure  

---

## 3. CBT Tool Kit (MVP Core)

If the user opts in, NAV-BOT chooses **one of three tools**.

---

### 1️⃣ Safe Venting (Stay Here)

**Used when**
- Emotional load is high  

**What NAV-BOT does**
- Reflective responses  
- Validation  
- Sentiment-based visual feedback  
- No fixing  

---

### 2️⃣ CBT Thought Challenge (Brain-Based Explanations)

**Used when**
- Distorted thinking appears  

**Flow**
- Identify the cognitive distortion  
- Ask 1–2 grounding questions  
- Offer a balanced reframe  

Short. Bounded. Optional.

**Example responses**
- “Your brain is in survival mode, not failure mode.”  
- “This is your amygdala being louder than your prefrontal cortex.”  
- “Lack of motivation isn’t a character flaw — it’s dopamine dysregulation.”  

These explanations reduce shame and build awareness.

---

### 3️⃣ Study / Unstuck Mode (Task Breakdown)

**Used when**
- Avoidance or overwhelm appears  

This is where task breakdown lives.

**What NAV-BOT does**
- Lowers perceived threat  
- Reduces cognitive load  
- Shifts from evaluation → action  

**How**
- Breaks tasks into very small chunks  
- Offers time-block suggestions  
- Reduces mental load  
- Uses compassionate accountability  

**UI behavior**
- Converts vague stress into a small, concrete checklist  
- Steps are intentionally tiny and time-bounded  
- Users can check items off as they go  

**Example steps**
- ☐ Stand up / get water (2 min)  
- ☐ Open notes (no reading yet)  
- ☐ List topics only (5–10 min)  

**Design rules**
- Finishing everything is *not* required  
- Stopping on purpose is allowed  
- Progress = approach, not completion  

**Optional (with consent)**
- Soft focus mode  
- Timers or reminders  
- Easy exit at any time  

This is behavioral activation — not productivity pressure.

---

## 4. Awareness Layer (Optional, Brief)

Only **after** the user is calmer or moving.

**Purpose**
- Reduce shame  
- Build metacognition  
- Explain *why* something helped  

**Example responses**
- “Breaking this down helped your planning brain come back online.”  
- “Your brain is in survival mode, not failure mode.”  
- “This is your amygdala being louder than your prefrontal cortex.”  

Never before action. Never as a lecture.

---

## Neuroscience Behind the CBT Approach (Context)

### Thoughts → Emotions → Behaviors
Thoughts activate:
- Amygdala (emotion / threat)  
- Prefrontal cortex (planning / reasoning)  

CBT supports prefrontal-driven regulation during stress.

### Cognitive Distortions = Autopilot Errors
Common distortions:
- Catastrophizing  
- Mind-reading  
- All-or-nothing thinking  

These activate threat circuits.  
CBT teaches identification and challenge.

### Behavioral Activation
Low mood → less activity → lower mood.  
CBT reverses this by acting first and letting mood follow.

### Exposure & Reward Prediction
- Test anxiety reduces with controlled exposure  
- Dopamine loops (notifications, scrolling) distort motivation  
- CBT reframes rewards toward long-term motivation  

---

## 5. Analytics Dashboard (Later / MVP+)

- Mood tracking + sentiment graph  
- Gen-Z–styled dashboard  
- Weekly mood trends  
- “Emotional weather report”  
- Stress spike highlights  
- Gentle predictions (e.g., “Mondays seem hardest for you”)  
- Personal insights  
- AI-generated summaries  

---

## Long-Term Effect: Supporting Resilient Coping Patterns

1️⃣ **Early pattern recognition**
- “This looks like catastrophizing.”  
- “This sounds like avoidance.”  
- “This feels like rumination.”  

2️⃣ **Intervention at the right moment**
- Not hours later  
- Not in a lesson  
- When the pattern appears in chat  

3️⃣ **Guided alternative responses**
Instead of:
- Avoidance → scrolling  
- Rumination → spiraling  
- Threat → shutdown  

NAV-BOT nudges toward:
- Task shrinking  
- Reframing  
- Values-based action  
- Bounded effort  

This is prefrontal practice, not advice.

4️⃣ **Over time**
- Interruptions happen earlier  
- Avoidance windows shrink  
- Users trust themselves more  
- Healthier responses become defaults  