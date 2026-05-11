<template>
  <v-app>
    <v-main>
      <v-container class="respondent-container">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
/* Respondent body register: 16 px is the mobile-readability minimum
 * (UX spec §Typography System). The 18 px "body-large" variant for the
 * question being answered is applied per-component by `<KanoLikert>`. */
:deep(.v-application__wrap) {
  font-size: 1rem;
}

.respondent-container {
  max-width: 480px;
  padding-left: 16px;
  padding-right: 16px;
  padding-top: 24px;
  padding-bottom: 24px;
}
</style>
