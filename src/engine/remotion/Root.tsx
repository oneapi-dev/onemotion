import { Composition, type CalculateMetadataFunction } from "remotion";
import { DIMENSIONS, FPS, type VideoInput } from "../plan";
import { SAMPLE_INPUT } from "../sample";
import { Video, planFrames } from "../Video";

// Size and length follow the props: the format and the plan.
const calculateMetadata: CalculateMetadataFunction<VideoInput> = ({ props }) => ({
  durationInFrames: planFrames(props.plan),
  ...DIMENSIONS[props.format],
});

export const RemotionRoot: React.FC = () => (
  <Composition
    id="video"
    component={Video}
    fps={FPS}
    width={1920}
    height={1080}
    durationInFrames={planFrames(SAMPLE_INPUT.plan)}
    defaultProps={SAMPLE_INPUT}
    calculateMetadata={calculateMetadata}
  />
);
