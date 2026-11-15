import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FPS, T } from './theme';
import { Chip, Fade, Felt, Footer, Rise, Rule, Wordmark } from './ui';

export const INTRO_FRAMES = 10 * FPS;

export const Intro: React.FC = () => (
  <Felt>
    <Fade total={INTRO_FRAMES}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ transform: 'translateY(-70px)' }}>
          <Wordmark size={170} delay={6} />
          <Rule delay={40} width={640} style={{ marginTop: 26 }} />
          <Rise delay={52}>
            <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 50, color: T.cream, textAlign: 'center', marginTop: 26 }}>Your club. Your table. Your cue.</div>
          </Rise>
          <div style={{ display: 'flex', gap: 22, justifyContent: 'center', marginTop: 54 }}>
            <Chip text="Hand-tracked snooker" delay={110} />
            <Chip text="Meta Quest, in the browser" delay={120} />
            <Chip text="No install" delay={130} />
          </div>
        </div>
      </AbsoluteFill>
      <Footer text="Meta VR hackathon demo  ·  footage captured in the game's desktop preview" delay={170} />
    </Fade>
  </Felt>
);
