'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface TweetCard {
  id: string;
  tweet: string;
  eventType: string;
  over: string;
  score: string;
  timestamp: Date;
  copied: boolean;
}

const EVENT_EMOJI: Record<string, string> = {
  wicket: '🎯',
  six: '💥',
  four: '🔥',
  fifty: '⭐',
  hundred: '🏆',
  noball: '🚨',
  normal: '🏏',
};

const EVENT_LABEL: Record<string, string> = {
  wicket: 'WICKET',
  six: 'SIX!',
  four: 'FOUR!',
  fifty: 'FIFTY!',
  hundred: 'CENTURY!',
  noball: 'NO BALL',
  normal: 'UPDATE',
};

const EVENT_COLOR: Record<string, string> = {
  wicket: '#ff4444',
  six: '#00e5a0',
  four: '#ff6b35',
  fifty: '#ffd700',
  hundred: '#ffd700',
  noball: '#a855f7',
  normal: '#6b7280',
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [tweets, setTweets] = useState<TweetCard[]>([]);
  const [matchInfo, setMatchInfo] = useState('');
  const [status, setStatus] = useState<'idle' | 'fetching' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const [nextPollIn, setNextPollIn] = useState(0);
  const [seenEventIds, setSeenEventIds] = useState<Set<string>>(new Set());
  const [generatingCount, setGeneratingCount] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout>();
  const countdownRef = useRef<NodeJS.Timeout>();
  const seenRef = useRef<Set<string>>(new Set());

  const POLL_INTERVAL = 30; // seconds

  const processEvents = useCallback(async (events: any[], info: string) => {
    if (events.length === 0) return;

    // Filter to only unseen important events
    const newEvents = events.filter(e => {
      const key = `${e.over}-${e.text.slice(0, 30)}`;
      if (seenRef.current.has(key)) return false;
      if (e.type === 'normal' || e.type === 'skip') return false;
      seenRef.current.add(key);
      return true;
    });

    if (newEvents.length === 0) return;

    setGeneratingCount(prev => prev + newEvents.length);

    // Generate tweets for each important event
    for (const event of newEvents.slice(0, 5)) { // max 5 per poll
      try {
        const res = await fetch('/api/generate-tweet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, matchInfo: info, score: event.score }),
        });
        const data = await res.json();

        if (!data.skip && data.tweet && data.tweet !== 'SKIP') {
          const card: TweetCard = {
            id: `${event.id}-${Date.now()}`,
            tweet: data.tweet,
            eventType: event.type,
            over: event.over,
            score: event.score || '',
            timestamp: new Date(),
            copied: false,
          };
          setTweets(prev => [card, ...prev].slice(0, 50)); // keep last 50
        }
      } catch (err) {
        console.error('Tweet gen failed:', err);
      }
      setGeneratingCount(prev => Math.max(0, prev - 1));
    }
  }, []);

  const poll = useCallback(async () => {
    if (!url) return;
    setStatus('fetching');
    setErrorMsg('');

    try {
      const res = await fetch('/api/fetch-commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Fetch failed');

      if (data.matchInfo) setMatchInfo(data.matchInfo);
      setPollCount(prev => prev + 1);
      setStatus('idle');

      if (data.events) {
        await processEvents(data.events, data.matchInfo || matchInfo);
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to fetch commentary');
    }
  }, [url, matchInfo, processEvents]);

  const startPolling = useCallback(() => {
    if (!url.trim()) return;
    setIsRunning(true);
    seenRef.current = new Set();
    setTweets([]);
    setPollCount(0);
    setNextPollIn(POLL_INTERVAL);

    poll(); // immediate first poll

    intervalRef.current = setInterval(() => {
      poll();
      setNextPollIn(POLL_INTERVAL);
    }, POLL_INTERVAL * 1000);
  }, [url, poll]);

  const stopPolling = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (isRunning) {
      countdownRef.current = setInterval(() => {
        setNextPollIn(prev => {
          if (prev <= 1) return POLL_INTERVAL;
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [isRunning]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const copyTweet = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setTweets(prev => prev.map(t => t.id === id ? { ...t, copied: true } : t));
    setTimeout(() => {
      setTweets(prev => prev.map(t => t.id === id ? { ...t, copied: false } : t));
    }, 2000);
  };

  const openInX = (text: string) => {
    const encoded = encodeURIComponent(text);
    window.open(`https://twitter.com/intent/tweet?text=${encoded}`, '_blank');
  };

  const deleteTweet = (id: string) => {
    setTweets(prev => prev.filter(t => t.id !== id));
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '20px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(12px)',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent), #00b37d)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>🏏</div>
          <div>
            <div className="font-display" style={{ fontSize: 28, letterSpacing: 2, color: 'var(--text)' }}>
              CRIC<span style={{ color: 'var(--accent)' }}>TWEET</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, marginTop: -2 }}>
              LIVE MATCH → AI TWEET AUTOMATION
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {isRunning && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="pulse-live" style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: status === 'error' ? '#ff4444' : 'var(--accent)',
                }}></div>
                <span style={{ fontSize: 12, color: status === 'error' ? '#ff4444' : 'var(--accent)', fontWeight: 600 }}>
                  {status === 'fetching' ? 'FETCHING...' : status === 'error' ? 'ERROR' : 'LIVE'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Next poll in <span style={{ color: 'var(--text)', fontWeight: 600 }}>{nextPollIn}s</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Polls: <span style={{ color: 'var(--text)' }}>{pollCount}</span>
              </div>
            </>
          )}
          {tweets.length > 0 && (
            <div style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 12,
              color: 'var(--accent)',
              fontWeight: 600,
            }}>
              {tweets.length} tweets
            </div>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
        {/* URL Input Section */}
        <div style={{
          background: 'var(--surface)',
          border: `1px solid ${isRunning ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 16,
          padding: '24px',
          marginBottom: 32,
          transition: 'border-color 0.3s',
        }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1, fontWeight: 600 }}>
              COMMENTARY URL
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Cricbuzz, ESPNcricinfo, or Google Search URL..."
              disabled={isRunning}
              onKeyDown={e => e.key === 'Enter' && !isRunning && startPolling()}
              style={{
                flex: 1,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 16px',
                color: 'var(--text)',
                fontSize: 14,
                outline: 'none',
                fontFamily: 'DM Sans, sans-serif',
                opacity: isRunning ? 0.6 : 1,
              }}
            />
            <button
              onClick={isRunning ? stopPolling : startPolling}
              disabled={!url.trim() && !isRunning}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: 18,
                letterSpacing: 1,
                transition: 'all 0.2s',
                background: isRunning
                  ? 'rgba(255,68,68,0.15)'
                  : 'var(--accent)',
                color: isRunning ? '#ff4444' : '#000',
                border: isRunning ? '1px solid #ff4444' : 'none',
                minWidth: 120,
              }}
            >
              {isRunning ? '⏹ STOP' : '▶ START'}
            </button>
          </div>

          {errorMsg && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: 'rgba(255,68,68,0.1)',
              border: '1px solid rgba(255,68,68,0.3)',
              borderRadius: 8, fontSize: 13, color: '#ff8888',
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {matchInfo && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>MATCH:</span>
              <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>{matchInfo}</span>
            </div>
          )}

          {/* Source tips */}
          {!isRunning && tweets.length === 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, letterSpacing: 0.5 }}>
                SUPPORTED SOURCES
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: '🟢 Cricbuzz', example: 'cricbuzz.com/live-cricket-scores/…' },
                  { label: '🔵 ESPNcricinfo', example: 'espncricinfo.com/series/…/match/…' },
                  { label: '🔴 Google', example: 'google.com/search?q=india+vs+aus+live+score' },
                ].map(({ label, example }) => (
                  <div key={label} style={{
                    fontSize: 11, color: 'var(--muted)',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 6, padding: '5px 10px',
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{label}</span>
                    <span style={{ opacity: 0.6 }}>{example}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active source badge */}
          {isRunning && matchInfo && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>SOURCE:</span>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 1,
                padding: '2px 8px', borderRadius: 4,
                background: url.includes('cricbuzz') ? 'rgba(0,229,160,0.15)' :
                             url.includes('espn') ? 'rgba(0,100,255,0.15)' :
                             url.includes('google') ? 'rgba(255,80,80,0.15)' : 'rgba(150,150,150,0.15)',
                color: url.includes('cricbuzz') ? 'var(--accent)' :
                       url.includes('espn') ? '#60a5fa' :
                       url.includes('google') ? '#f87171' : 'var(--muted)',
              }}>
                {url.includes('cricbuzz') ? 'CRICBUZZ' :
                 url.includes('espn') ? 'ESPNCRICINFO' :
                 url.includes('google') ? 'GOOGLE' : 'GENERIC'}
              </span>
            </div>
          )}
        </div>

        {/* Generating indicator */}
        {generatingCount > 0 && (
          <div style={{
            marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px',
            background: 'rgba(0,229,160,0.08)',
            border: '1px solid rgba(0,229,160,0.2)',
            borderRadius: 10,
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              border: '2px solid var(--accent)',
              borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
            }}></div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <span style={{ fontSize: 13, color: 'var(--accent)' }}>
              Generating {generatingCount} tweet{generatingCount > 1 ? 's' : ''}...
            </span>
          </div>
        )}

        {/* Empty state */}
        {tweets.length === 0 && !isRunning && (
          <div style={{
            textAlign: 'center', padding: '80px 24px',
            color: 'var(--muted)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏏</div>
            <div className="font-display" style={{ fontSize: 32, color: 'var(--surface2)', marginBottom: 8 }}>
              AWAITING THE ACTION
            </div>
            <div style={{ fontSize: 14 }}>
              Paste a Cricbuzz or ESPNcricinfo live match URL above and hit Start
            </div>
          </div>
        )}

        {tweets.length === 0 && isRunning && pollCount > 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 24px',
            color: 'var(--muted)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>👀</div>
            <div style={{ fontSize: 14 }}>
              Monitoring for big moments... waiting for a wicket, six, or milestone
            </div>
          </div>
        )}

        {/* Tweet Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tweets.map((card, idx) => (
            <TweetCard
              key={card.id}
              card={card}
              onCopy={() => copyTweet(card.id, card.tweet)}
              onPost={() => openInX(card.tweet)}
              onDelete={() => deleteTweet(card.id)}
              isNew={idx === 0}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function TweetCard({ card, onCopy, onPost, onDelete, isNew }: {
  card: TweetCard;
  onCopy: () => void;
  onPost: () => void;
  onDelete: () => void;
  isNew: boolean;
}) {
  const color = EVENT_COLOR[card.eventType] || EVENT_COLOR.normal;
  const emoji = EVENT_EMOJI[card.eventType] || '🏏';
  const label = EVENT_LABEL[card.eventType] || 'UPDATE';
  const timeStr = card.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className={isNew ? 'slide-in' : ''}
      style={{
        background: 'var(--surface)',
        border: `1px solid var(--border)`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 14,
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 60,
        background: `linear-gradient(180deg, ${color}08, transparent)`,
        pointerEvents: 'none',
      }}></div>

      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{emoji}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
            color, fontFamily: 'Bebas Neue, sans-serif', fontSize: 14,
          }}>{label}</span>
          {card.over && (
            <span style={{
              fontSize: 11, color: 'var(--muted)',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 6px',
            }}>
              Over {card.over}
            </span>
          )}
          {card.score && (
            <span style={{
              fontSize: 11, color: 'var(--muted)',
            }}>
              {card.score}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{timeStr}</span>
          <button
            onClick={onDelete}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', fontSize: 16, padding: '2px 4px',
              lineHeight: 1, borderRadius: 4,
            }}
            title="Dismiss"
          >×</button>
        </div>
      </div>

      {/* Tweet text */}
      <p style={{
        fontSize: 16, lineHeight: 1.6, color: 'var(--text)',
        marginBottom: 16, fontWeight: 400,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 16px',
      }}>
        {card.tweet}
      </p>

      {/* Character count */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 11, color: card.tweet.length > 240 ? '#ff4444' : 'var(--muted)',
        }}>
          {card.tweet.length}/280 characters
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCopy}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: card.copied ? 'rgba(0,229,160,0.15)' : 'var(--surface2)',
              color: card.copied ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'DM Sans, sans-serif',
              fontWeight: 500,
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {card.copied ? '✓ Copied' : '📋 Copy'}
          </button>
          <button
            onClick={onPost}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#000',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'DM Sans, sans-serif',
              fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
            onMouseLeave={e => (e.currentTarget.style.background = '#000')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.738l7.726-8.83L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Post on X
          </button>
        </div>
      </div>
    </div>
  );
}
