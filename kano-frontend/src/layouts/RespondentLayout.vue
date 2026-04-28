<template>
  <v-app>
    <v-main>
      <v-container class="respondent-container">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<script lang="ts" setup>
//
</script>

<style scoped>
.respondent-container {
  max-width: 480px;
  padding-left: 16px;
  padding-right: 16px;
  padding-top: 24px;
  padding-bottom: 24px;
}
</style>
