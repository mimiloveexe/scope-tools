<script setup lang="ts">
import Card from "primevue/card";
import Tab from "primevue/tab";
import TabList from "primevue/tablist";
import TabPanel from "primevue/tabpanel";
import TabPanels from "primevue/tabpanels";
import Tabs from "primevue/tabs";
import { ref } from "vue";

import HistoryPrune from "./HistoryPrune.vue";
import ImportRequests from "./ImportRequests.vue";
import SitemapPrune from "./SitemapPrune.vue";

const activeTab = ref("0");
</script>

<template>
  <div class="h-full">
    <Card
      class="h-full bg-surface-700"
      :pt="{
        body: { class: 'h-full p-0' },
        content: { class: 'h-full flex flex-col' },
      }"
    >
      <template #content>
        <Tabs v-model:value="activeTab" class="h-full">
          <TabList>
            <Tab value="0">
              <div class="flex items-center gap-2">
                <i class="fas fa-sitemap"></i>
                <span>Sitemap</span>
              </div>
            </Tab>
            <Tab value="1">
              <div class="flex items-center gap-2">
                <i class="fas fa-list"></i>
                <span>HTTP History</span>
              </div>
            </Tab>
            <Tab value="2">
              <div class="flex items-center gap-2">
                <i class="fas fa-file-import"></i>
                <span>Import</span>
              </div>
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel value="0">
              <SitemapPrune />
            </TabPanel>
            <TabPanel value="1">
              <HistoryPrune />
            </TabPanel>
            <TabPanel value="2">
              <ImportRequests />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </template>
    </Card>
  </div>
</template>
