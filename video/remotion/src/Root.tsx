import React from 'react';
import { Composition } from 'remotion';
import { Intro, INTRO_FRAMES } from './Intro';
import { Outro, OUTRO_FRAMES } from './Outro';
import { FPS } from './theme';

export const Root: React.FC = () => (
  <>
    <Composition id="Intro" component={Intro} durationInFrames={INTRO_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="Outro" component={Outro} durationInFrames={OUTRO_FRAMES} fps={FPS} width={1920} height={1080} />
  </>
);
