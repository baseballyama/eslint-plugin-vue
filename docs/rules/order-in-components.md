---
pageClass: rule-details
sidebarDepth: 0
title: vue/order-in-components
description: enforce order of properties in components
since: v3.2.0
---

# vue/order-in-components

> enforce order of properties in components

- :gear: This rule is included in all of `"plugin:vue/recommended"`, `*.configs["flat/recommended"]`, `"plugin:vue/vue2-recommended"` and `*.configs["flat/vue2-recommended"]`.
- :wrench: The `--fix` option on the [command line](https://eslint.org/docs/user-guide/command-line-interface#fix-problems) can automatically fix some of the problems reported by this rule.
- :bulb: Some problems reported by this rule are manually fixable by editor [suggestions](https://eslint.org/docs/developer-guide/working-with-rules#providing-suggestions).

## :book: Rule Details

This rule makes sure you keep declared order of properties in components.
Recommended order of properties can be [found here](https://vuejs.org/style-guide/rules-recommended.html#component-instance-options-order).

<eslint-code-block fix :rules="{'vue/order-in-components': ['error']}">

```vue
<script>
/* ✓ GOOD */
export default {
  name: 'app',
  props: {
    propA: Number
  },
  data() {
    return {
      msg: 'Welcome to Your Vue.js App'
    }
  }
}
</script>
```

</eslint-code-block>

<eslint-code-block fix :rules="{'vue/order-in-components': ['error']}">

```vue
<script>
/* ✗ BAD */
export default {
  name: 'app',
  data() {
    return {
      msg: 'Welcome to Your Vue.js App'
    }
  },
  props: {
    propA: Number
  }
}
</script>
```

</eslint-code-block>

## :wrench: Options

```json
{
  "vue/order-in-components": ["error", {
    "order": [
      "el",
      "name",
      "key",
      "parent",
      "functional",
      ["delimiters", "comments"],
      ["components", "directives", "filters"],
      "extends",
      "mixins",
      ["provide", "inject"],
      "ROUTER_GUARDS",
      "layout",
      "middleware",
      "validate",
      "scrollToTop",
      "transition",
      "loading",
      "inheritAttrs",
      "model",
      ["props", "propsData"],
      "emits",
      "slots",
      "expose",
      "setup",
      "asyncData",
      "data",
      "fetch",
      "head",
      "computed",
      "watch",
      "watchQuery",
      "LIFECYCLE_HOOKS",
      "methods",
      ["template", "render"],
      "renderError"
    ]
  }]
}
```

- `order` (`(string | string[])[]`) ... The order of properties. Elements are the property names or one of the following groups:

  - `LIFECYCLE_HOOKS`: [Vue Lifecycle Events](https://vuejs.org/guide/essentials/lifecycle.html#lifecycle-diagram), in the order they are called
  - `ROUTER_GUARDS`: [Vue Router Navigation Guards](https://router.vuejs.org/guide/advanced/navigation-guards.html#in-component-guards), in the order they are called

  If an element is an array of strings, it means any of those can be placed there unordered. Default is above.

## :books: Further Reading

- [Style guide - Component/instance options order](https://vuejs.org/style-guide/rules-recommended.html#component-instance-options-order)
- [Style guide (for v2) - Component/instance options order](https://v2.vuejs.org/v2/style-guide/#Component-instance-options-order-recommended)

## :rocket: Version

This rule was introduced in eslint-plugin-vue v3.2.0

## :mag: Implementation

- [Rule source](https://github.com/vuejs/eslint-plugin-vue/blob/master/lib/rules/order-in-components.js)
- [Test source](https://github.com/vuejs/eslint-plugin-vue/blob/master/tests/lib/rules/order-in-components.js)
