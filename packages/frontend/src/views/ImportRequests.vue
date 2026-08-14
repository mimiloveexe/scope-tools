<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { ref } from "vue";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();
const fileInput = ref<HTMLInputElement>();
const fileName = ref<string>();
const importing = ref(false);
const summary = ref<{ imported: number; failed: number; errors: string[] }>();

const pickFile = () => fileInput.value?.click();

const onFileChange = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  fileName.value = file.name;
  summary.value = undefined;
  importing.value = true;

  const text = await file.text();
  try {
    const result = await sdk.backend.importExportJson(text);
    if (result.kind === "Ok") {
      summary.value = result.value;
      sdk.window.showToast(`Imported ${result.value.imported} requests`, {
        variant: result.value.failed > 0 ? "warning" : "success",
      });
    } else {
      sdk.window.showToast(result.error, { variant: "error" });
    }
  } finally {
    importing.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <p class="text-surface-300">
      Import requests from a Caido "Export requests" JSON file. Imported
      requests are recreated with <code>source: Import</code> and will show up
      in <strong>Search</strong> — enable the "Import" source checkbox under
      Search's Advanced options to see them. They do not appear in the HTTP
      History tab, which is reserved for traffic actually proxied through Caido.
    </p>

    <input
      ref="fileInput"
      type="file"
      accept="application/json"
      class="hidden"
      @change="onFileChange"
    />
    <div class="flex items-center gap-2">
      <Button
        label="Choose export JSON file"
        icon="fas fa-file-import"
        :loading="importing"
        @click="pickFile"
      />
      <span v-if="fileName" class="text-surface-300">{{ fileName }}</span>
    </div>

    <template v-if="summary">
      <Message :severity="summary.failed > 0 ? 'warn' : 'success'">
        Imported {{ summary.imported }} requests
        <span v-if="summary.failed > 0">, {{ summary.failed }} failed</span>
      </Message>
      <ul
        v-if="summary.errors.length > 0"
        class="list-disc pl-6 text-surface-300 max-h-48 overflow-y-auto"
      >
        <li v-for="(err, i) in summary.errors" :key="i">{{ err }}</li>
      </ul>
    </template>
  </div>
</template>
