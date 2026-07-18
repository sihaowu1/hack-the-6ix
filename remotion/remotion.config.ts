import { Config } from '@remotion/cli/config';

// "angle" keeps WebGL (Three.js) working in Remotion's headless Chrome.
Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
