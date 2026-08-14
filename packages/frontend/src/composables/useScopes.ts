import { onMounted, onUnmounted, ref } from "vue";

import { useSDK } from "@/plugins/sdk";

export type ScopeOption = {
  id: string;
  name: string;
  allowlist: string[];
  denylist: string[];
};

export function useScopes() {
  const sdk = useSDK();
  const scopes = ref<ScopeOption[]>([]);
  const loading = ref(false);
  // Bumped on every project switch so consumers can reset scope-dependent
  // local state (selected scope, previews) that would otherwise reference
  // the previous project's data.
  const version = ref(0);

  const load = async () => {
    loading.value = true;
    const result = await sdk.backend.listScopes();
    if (result.kind === "Ok") {
      scopes.value = result.value;
    } else {
      sdk.window.showToast(result.error, { variant: "error" });
    }
    loading.value = false;
  };

  onMounted(load);

  const handle = sdk.projects.onCurrentProjectChange(() => {
    version.value++;
    scopes.value = [];
    void load();
  });
  onUnmounted(() => handle.stop());

  return { scopes, loading, version, reload: load };
}
