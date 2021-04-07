/**
 * @fileoverview Disallow undefined properties.
 * @author Yosuke Ota
 */
'use strict'

const RuleTester = require('eslint').RuleTester
const rule = require('../../../lib/rules/no-undef-properties')

const tester = new RuleTester({
  parser: require.resolve('vue-eslint-parser'),
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  }
})

tester.run('no-undef-properties', rule, {
  valid: [
    {
      filename: 'test.vue',
      code: `
      <template>
        <div :attr="foo"> {{ bar }} </div>
      </template>
      <script>
        export default {
          props: ['foo'],
          data () {
            return {
              bar: 42
            }
          },
          created() {
            this.baz()
          },
          methods: {
            baz() {}
          }
        };
      </script>
      `
    },
    {
      filename: 'test.vue',
      code: `
      <template>
        <div :attr="foo"> {{ bar }} </div>
      </template>
      <script>
        export default {
          inject: ['foo'],
          setup() {
            return {
              bar: 42
            }
          },
          computed: {
            baz() {
              return 42
            }
          },
          created() {
            console.log(this.baz)
          }
        };
      </script>
      `
    },
    //default ignores
    {
      filename: 'test.vue',
      code: `
      <template>
        <div>{{ $t('foo') }}</div>
      </template>
      <script>
        export default {
          mounted() {
            const hash = this.$route.hash
            this.$on('click', this.click)
          },
          methods: {
            click() {
              this.$nextTick()
            }
          }
        }
      </script>
      `
    },

    //watch
    {
      filename: 'test.vue',
      code: `
      <script>
        export default {
          props: ['foo'],
          watch: {
            foo: 'bar'
          },
          methods: {
            bar() {}
          }
        };
      </script>
      `
    },
    {
      filename: 'test.vue',
      code: `
      <script>
        export default {
          data () {
            return {
              foo: {
                bar :42
              }
            }
          },
          watch: {
            'foo.bar': 'baz'
          },
          methods: {
            baz() {}
          }
        };
      </script>
      `
    }
  ],

  invalid: [
    // undef property
    {
      filename: 'test.vue',
      code: `
      <template>
        <div :attr="foo2"> {{ bar2 }} </div>
      </template>
      <script>
        export default {
          props: ['foo'],
          data () {
            return {
              bar: 42
            }
          },
          created() {
            this.baz2()
          },
          methods: {
            baz() {}
          }
        };
      </script>
      `,
      errors: [
        {
          message: "'foo2' is not defined.",
          line: 3
        },
        {
          message: "'bar2' is not defined.",
          line: 3
        },
        {
          message: "'baz2' is not defined.",
          line: 14
        }
      ]
    },
    {
      filename: 'test.vue',
      code: `
      <template>
        <div :attr="foo2"> {{ bar2 }} </div>
      </template>
      <script>
        export default {
          inject: ['foo'],
          setup() {
            return {
              bar: 42
            }
          },
          computed: {
            baz() {
              return 42
            }
          },
          created() {
            console.log(this.baz2)
          }
        };
      </script>
      `,
      errors: [
        {
          message: "'foo2' is not defined.",
          line: 3
        },
        {
          message: "'bar2' is not defined.",
          line: 3
        },
        {
          message: "'baz2' is not defined.",
          line: 19
        }
      ]
    },

    //watch
    {
      filename: 'test.vue',
      code: `
      <script>
        export default {
          props: ['foo'],
          watch: {
            foo2: 'bar2'
          },
          methods: {
            bar() {}
          }
        };
      </script>
      `,
      errors: [
        {
          message: "'foo2' is not defined.",
          line: 6
        },
        {
          message: "'bar2' is not defined.",
          line: 6
        }
      ]
    },
    {
      filename: 'test.vue',
      code: `
      <script>
        export default {
          data () {
            return {
              foo: {
                bar :42
              }
            }
          },
          watch: {
            'foo2.bar': 'baz',
            'foo.bar2': 'baz',
          },
          methods: {
            baz() {}
          }
        };
      </script>
      `,
      errors: [
        {
          message: "'foo2' is not defined.",
          line: 12
        },
        {
          message: "'foo.bar2' is not defined.",
          line: 13
        }
      ]
    }
  ]
})
