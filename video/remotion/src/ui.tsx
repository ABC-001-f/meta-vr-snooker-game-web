import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { T } from './theme';

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

/* Baize-green room with a lamp glow at the top and a vignette, plus the six snooker ball colours as faint dots. */
export const Felt: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const sway = Math.sin(frame / 70) * 3;
  return (
    <AbsoluteFill style={{ background: T.night, color: T.cream, fontFamily: T.serif, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at ${50 + sway}% 8%, ${T.felt} 0%, ${T.feltDark} 55%, ${T.night} 100%)` }} />
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)', backgroundSize: '7px 7px', opacity: 0.6 }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />
      {children}
    </AbsoluteFill>
  );
};

/* Fade in at the start and out at the end of the composition. */
export const Fade: React.FC<{ total: number; inFrames?: number; outFrames?: number; children: React.ReactNode }> = ({ total, inFrames = 12, outFrames = 15, children }) => {
  const frame = useCurrentFrame();
  const o = Math.min(interpolate(frame, [0, inFrames], [0, 1], clamp), interpolate(frame, [total - outFrames, total], [1, 0], clamp));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

/* Rises into place with a spring, `delay` frames after the start. */
export const Rise: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties; from?: number }> = ({ delay = 0, children, style, from = 34 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 17, stiffness: 110, mass: 0.9 } });
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * from}px)`, ...style }}>{children}</div>;
};

/* A brass rule that wipes out from the centre. */
export const Rule: React.FC<{ delay?: number; width?: number; style?: React.CSSProperties }> = ({ delay = 0, width = 520, style }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 18], [0, 1], clamp);
  return <div style={{ width: width * p, height: 3, background: `linear-gradient(90deg, transparent, ${T.gold}, transparent)`, margin: '0 auto', ...style }} />;
};

/* Small pill label. */
export const Chip: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => (
  <Rise delay={delay} from={18}>
    <span style={{ display: 'inline-block', padding: '12px 26px', borderRadius: 999, border: `1.5px solid ${T.gold}`, color: T.cream, fontFamily: T.sans, fontSize: 30, letterSpacing: '0.02em', background: 'rgba(0,0,0,0.35)' }}>{text}</span>
  </Rise>
);

/* The CUEVERSE VR wordmark as it appears on the entry card. */
export const Wordmark: React.FC<{ size?: number; delay?: number }> = ({ size = 150, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = 'CUEVERSE'.split('');
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: size * 0.045 }}>
        {letters.map((ch, i) => {
          const p = spring({ frame: frame - delay - i * 2, fps, config: { damping: 14, stiffness: 120 } });
          return (
            <span key={i} style={{ fontFamily: T.serif, fontWeight: 700, fontSize: size, color: T.gold, opacity: p, transform: `translateY(${(1 - p) * 40}px)`, textShadow: '0 6px 30px rgba(0,0,0,0.6)' }}>{ch}</span>
          );
        })}
      </div>
      <Rise delay={delay + 18} from={14}>
        <div style={{ fontFamily: T.serif, fontSize: size * 0.34, letterSpacing: '0.45em', color: T.gold, marginTop: size * 0.02, paddingLeft: '0.45em' }}>VR</div>
      </Rise>
    </div>
  );
};

export const Footer: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => (
  <div style={{ position: 'absolute', bottom: 44, left: 0, right: 0, textAlign: 'center' }}>
    <Rise delay={delay} from={10}>
      <span style={{ fontFamily: T.sans, fontSize: 24, color: T.muted, letterSpacing: '0.04em' }}>{text}</span>
    </Rise>
  </div>
);
