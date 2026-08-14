<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import { ref, watch } from "vue";

import { useScopes } from "@/composables/useScopes";
import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();
const { scopes, version } = useScopes();

const selectedScopeIds = ref<string[]>([]);
const previewing = ref(false);
const deleting = ref(false);
const preview = ref<{
  entries: Array<{ host: string; method: string; path: string }>;
  entryCount: number;
}>();

watch(version, () => {
  selectedScopeIds.value = [];
  preview.value = undefined;
});

const runPreview = async () => {
  if (selectedScopeIds.value.length === 0) return;
  previewing.value = true;
  preview.value = undefined;
  try {
    const result = await sdk.backend.previewHistoryPrune(
      selectedScopeIds.value,
    );
    if (result.kind === "Ok") {
      preview.value = result.value;
    } else {
      sdk.window.showToast(result.error, { variant: "error" });
    }
  } finally {
    previewing.value = false;
  }
};

const confirmDelete = async () => {
  if (selectedScopeIds.value.length === 0) return;
  deleting.value = true;
  try {
    const result = await sdk.backend.pruneHistory(selectedScopeIds.value);
    if (result.kind === "Ok") {
      const { deletedCount, failedCount } = result.value;
      sdk.window.showToast(
        failedCount > 0
          ? `Deleted ${deletedCount} entries, ${failedCount} failed`
          : `Deleted ${deletedCount} HTTP History entries`,
        { variant: failedCount > 0 ? "warning" : "success" },
      );
      preview.value = undefined;
    } else {
      sdk.window.showToast(result.error, { variant: "error" });
    }
  } finally {
    deleting.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <p class="text-surface-300">
      Delete every HTTP History entry whose host does not match any of the
      selected scope presets' allowlist/denylist. This scans the full history,
      so it may take a while on large projects.
    </p>

    <div class="flex items-center gap-2">
      <MultiSelect
        v-model="selectedScopeIds"
        :options="scopes"
        option-label="name"
        option-value="id"
        placeholder="Select scope presets"
        display="chip"
        class="w-96"
      />
      <Button
        label="Preview"
        icon="fas fa-magnifying-glass"
        :loading="previewing"
        :disabled="selectedScopeIds.length === 0"
        @click="runPreview"
      />
    </div>

    <Message v-if="preview && preview.entryCount === 0" severity="success">
      Nothing to delete — every history entry matches the selected scopes.
    </Message>

    <template v-if="preview && preview.entryCount > 0">
      <Message severity="warn">
        {{ preview.entryCount }} out-of-scope entries will be deleted
        <span v-if="preview.entries.length < preview.entryCount">
          (showing first {{ preview.entries.length }}):
        </span>
      </Message>
      <ul class="list-disc pl-6 text-surface-300 max-h-48 overflow-y-auto">
        <li v-for="(e, i) in preview.entries" :key="i">
          {{ e.method }} {{ e.host }}{{ e.path }}
        </li>
      </ul>
      <Button
        label="Delete out-of-scope entries"
        icon="fas fa-trash"
        severity="danger"
        :loading="deleting"
        @click="confirmDelete"
      />
    </template>
  </div>
</template>
