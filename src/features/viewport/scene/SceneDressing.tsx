import { AxisTriad } from "../gizmos/AxisTriad"
import { ViewCube } from "../gizmos/ViewCube"
import { CadGrid } from "./CadGrid"
import { SceneLighting } from "./SceneLighting"
import { StudioEnvironment } from "./StudioEnvironment"

/** Everything in the viewport that is not a part: lighting, ground grid and gizmos. */
export function SceneDressing() {
  return (
    <>
      <StudioEnvironment />
      <SceneLighting />
      <CadGrid />
      <ViewCube />
      <AxisTriad />
    </>
  )
}
