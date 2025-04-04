---
pageClass: rule-details
sidebarDepth: 0
title: vue/no-v-html
description: disallow use of v-html to prevent XSS attack
since: v4.7.0
---

# vue/no-v-html

> disallow use of v-html to prevent XSS attack

- :gear: This rule is included in all of `"plugin:vue/recommended"`, `*.configs["flat/recommended"]`, `"plugin:vue/vue2-recommended"` and `*.configs["flat/vue2-recommended"]`.

## :book: Rule Details

This rule reports all uses of `v-html` directive in order to reduce the risk of injecting potentially unsafe / unescaped html into the browser leading to Cross-Site Scripting (XSS) attacks.

<eslint-code-block :rules="{'vue/no-v-html': ['error']}">

```vue
<template>
  <!-- ✓ GOOD -->
  <div>{{ someHTML }}</div>

  <!-- ✗ BAD -->
  <div v-html="someHTML"></div>
</template>
```

</eslint-code-block>

## :wrench: Options

Nothing.

## :mute: When Not To Use It

If you are certain the content passed to `v-html` is sanitized HTML you can disable this rule.

## :rocket: Version

This rule was introduced in eslint-plugin-vue v4.7.0

## :mag: Implementation

- [Rule source](https://github.com/vuejs/eslint-plugin-vue/blob/master/lib/rules/no-v-html.js)
- [Test source](https://github.com/vuejs/eslint-plugin-vue/blob/master/tests/lib/rules/no-v-html.js)
