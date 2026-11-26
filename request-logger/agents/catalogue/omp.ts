import { ompModels } from "../setup-files";
import type { AgentEntry } from "../types";
import { CUSTOM_ID, CUSTOM_LABEL } from "../types";

const OMP_NOTE =
  "OMP has no backend of its own to hard-code the way the rest of this " +
  "catalogue does. It can point at Ollama, LM Studio, llama.cpp, LiteLLM, or " +
  "any other server that speaks one of the wire formats offered here, so " +
  "every OMP setup goes through the base URL and wire format you chose.";

export const OMP: AgentEntry = {
  id: "omp",
  label: "OMP (Oh My Pi)",
  // Every setup for OMP goes through the custom-base-url questions — see
  // AgentEntry.alwaysCustom. The one provider below never reaches the
  // wizard; it exists purely to hold the bin and setup-file template that
  // resolveCustomTarget borrows from, the same way findCustomTemplate
  // borrows from a real provider for every other agent.
  alwaysCustom: true,
  providers: [
    {
      id: CUSTOM_ID,
      label: CUSTOM_LABEL,
      // Unused: OMP never reaches the normal (non-custom) resolution path
      // that would read this.
      upstreamHost: "",
      // Irrelevant here too — the resolved renderer always comes from the
      // student's answer, not from this template. See resolveCustomTarget.
      renderer: "raw",
      bin: "omp",
      setup: [ompModels("{baseUrl}")],
      notes: [OMP_NOTE],
    },
  ],
};
