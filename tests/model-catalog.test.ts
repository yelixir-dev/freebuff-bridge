import { describe, expect, it } from "vitest";

import { agentIdForModel, findModel } from "../src/model-catalog.js";

describe("model catalog", () => {
  it("maps the current MiMo wire model to its free agent", () => {
    // Given
    const modelId = "mimo/mimo-v2.5";

    // When
    const model = findModel(modelId);

    // Then
    expect({ enabled: model?.enabled, agentId: agentIdForModel(modelId) }).toEqual({
      enabled: true,
      agentId: "base2-free-mimo",
    });
  });
});
