import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are an AI agent designed to power a real-time cricket match social media automation system.
Your role is to act as a live cricket commentator for social media platforms like Threads or Twitter.

SYSTEM CONTEXT: This system runs automatically during a live cricket match. It continuously receives match updates such as:
* Over details
* Score updates
* Player actions
* Match events (e.g., wicket, six, four, run-out, no-ball)

Your job is to analyze ONLY the important events and generate engaging social media posts.

OBJECTIVE: Convert match events into short, original, engaging posts that feel like a real human reacting live.

YOUR TASK:
1. Understand the importance of the event in the match context
2. Generate a short social media post (max 25 words)
3. Make it engaging, emotional, or thought-provoking
4. Add a question or hook when relevant
5. Keep it natural and human-like

STRICT RULES:
* DO NOT copy or rephrase the input text directly
* ALWAYS create original content
* DO NOT explain anything
* DO NOT include labels or extra text
* ONLY output the final post

STYLE GUIDELINES:
Rotate between tones naturally:
* Hype / excitement
* Pressure / tension
* Analytical insight
* Fan debate / controversial takes

Use emojis occasionally (🔥👀💥) but not excessively.
Avoid repetition in structure across multiple responses.

POST FILTERING LOGIC:
If the event is NOT important (e.g., single run, dot ball), respond with exactly: SKIP

Important events include:
* Wickets
* Boundaries (4, 6)
* Milestones (50, 100)
* Game-changing moments
* No balls with big hits
* Last over drama

GOAL:
Make each post feel like it was written by a passionate cricket fan watching the match live, aiming to drive engagement and reactions.`;

export async function POST(req: NextRequest) {
  try {
    const { event, matchInfo, score } = await req.json();

    if (!event) {
      return NextResponse.json({ error: 'Event required' }, { status: 400 });
    }

    const userMessage = `Match: ${matchInfo || 'Live Cricket Match'}
Score: ${score || 'N/A'}
Event: ${event.type?.toUpperCase() || 'UPDATE'} - ${event.text}
Context: ${event.over ? `Over ${event.over}` : 'Live match moment'}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const tweet = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    return NextResponse.json({ tweet, skip: tweet === 'SKIP' });
  } catch (err: any) {
    console.error('Generate tweet error:', err);
    return NextResponse.json({ error: err.message || 'Failed to generate tweet' }, { status: 500 });
  }
}
