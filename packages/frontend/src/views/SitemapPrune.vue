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
const preview = ref<{ domains: string[]; entryCount: number }>();

watch(version, () => {
  selectedScopeIds.value = [];
  preview.value = undefined;
});

const runPreview = async () => {
  if (selectedScopeIds.value.length === 0) return;
  previewing.value = true;
  preview.value = undefined;
  try {
    const result = await sdk.backend.previewSitemapPrune(
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
    const result = await sdk.backend.pruneSitemap(selectedScopeIds.value);
    if (result.kind === "Ok") {
      sdk.window.showToast(
        `Deleted ${result.value.deletedCount} sitemap entries`,
        { variant: "success" },
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
      Delete every Sitemap domain (and everything under it) whose host does not
      match any of the selected scope presets' allowlist/denylist.
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
      Nothing to delete — every sitemap domain matches the selected scopes.
    </Message>

    <template v-if="preview && preview.entryCount > 0">
      <Message severity="warn">
        {{ preview.entryCount }} sitemap entries across
        {{ preview.domains.length }} out-of-scope domains will be deleted:
      </Message>
      <ul class="list-disc pl-6 text-surface-300 max-h-48 overflow-y-auto">
        <li v-for="host in preview.domains" :key="host">{{ host }}</li>
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
