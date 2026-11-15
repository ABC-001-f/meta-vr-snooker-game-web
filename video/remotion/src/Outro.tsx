import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FPS, T } from './theme';
import { Chip, Fade, Felt, Footer, Rise, Rule, Wordmark } from './ui';

export const OUTRO_FRAMES = 12 * FPS;

const Line: React.FC<{ label: string; value: string; delay: number }> = ({ label, value, delay }) => (
  <Rise delay={delay}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 26, justifyContent: 'center', marginTop: 18 }}>
      <span style={{ fontFamily: T.sans, fontSize: 28, color: T.muted, letterSpacing: '0.12em', textTransform: 'uppercase', width: 230, textAlign: 'right' }}>{label}</span>
      <span style={{ fontFamily: T.sans, fontSize: 40, color: T.cream, fontWeight: 600 }}>{value}</span>
    </div>
  </Rise>
);

export const Outro: React.FC = () => (
  <Felt>
    <Fade total={OUTRO_FRAMES}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ transform: 'translateY(-40px)', width: 1500 }}>
          <Wordmark size={120} delay={4} />
          <Rule delay={30} width={560} style={{ marginTop: 22 }} />
          <div style={{ marginTop: 26 }}>
            <Line label="Play it" value="abc-001-f.github.io/meta-vr-snooker-game-web" delay={44} />
            <Line label="Source" value="github.com/ABC-001-f/meta-vr-snooker-game-web" delay={56} />
          </div>
          <div style={{ display: 'flex', gap: 22, justifyContent: 'center', marginTop: 50 }}>
            <Chip text="No install" delay={90} />
            <Chip text="No assets" delay={98} />
            <Chip text="Pure WebXR" delay={106} />
          </div>
          <Rise delay={160}>
            <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 34, color: T.muted, textAlign: 'center', marginTop: 60, lineHeight: 1.45 }}>
              Built on a 2012 laptop that cannot run a game engine, by someone who has never worn the headset.
              <br />
              Give it a Quest.
            </div>
          </Rise>
        </div>
      </AbsoluteFill>
      <Footer text="Open the link in the Meta Quest Browser  ·  put the controllers down  ·  reach out" delay={200} />
    </Fade>
  </Felt>
);
