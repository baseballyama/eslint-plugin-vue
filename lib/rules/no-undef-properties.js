/**
 * @fileoverview Disallow undefined properties.
 * @author Yosuke Ota
 */
'use strict'

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

const utils = require('../utils')
const eslintUtils = require('eslint-utils')
const reserved = require('../utils/vue-reserved.json')
const { toRegExp } = require('../utils/regexp')

/**
 * @typedef {import('../utils').ComponentPropertyData} ComponentPropertyData
 * @typedef {import('../utils').VueObjectData} VueObjectData
 */
/**
 * @typedef {object} PropertyData
 * @property {boolean} hasNestProperty
 * @property { (name: string) => PropertyData | null } get
 * @property {boolean} [isProps]
 *
 * @typedef {object} VueComponentPropertiesContainer
 * @property { Map<string, PropertyData> } properties
 */

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Find the variable of a given name.
 * @param {RuleContext} context The rule context
 * @param {Identifier} node The variable name to find.
 * @returns {Variable|null} The found variable or null.
 */
function findVariable(context, node) {
  return eslintUtils.findVariable(getScope(context, node), node)
}
/**
 * Gets the scope for the current node
 * @param {RuleContext} context The rule context
 * @param {ESNode} currentNode The node to get the scope of
 * @returns { import('eslint').Scope.Scope } The scope information for this node
 */
function getScope(context, currentNode) {
  // On Program node, get the outermost scope to avoid return Node.js special function scope or ES modules scope.
  const inner = currentNode.type !== 'Program'
  const scopeManager = context.getSourceCode().scopeManager

  /** @type {ESNode | null} */
  let node = currentNode
  for (; node; node = /** @type {ESNode | null} */ (node.parent)) {
    const scope = scopeManager.acquire(node, inner)

    if (scope) {
      if (scope.type === 'function-expression-name') {
        return scope.childScopes[0]
      }
      return scope
    }
  }

  return scopeManager.scopes[0]
}

/**
 * Extract names from references objects.
 * @param {VReference[]} references
 */
function getReferences(references) {
  return references.filter((ref) => ref.variable == null).map((ref) => ref.id)
}

/**
 * @param {RuleContext} context
 * @param {Identifier} id
 * @returns {FunctionExpression | ArrowFunctionExpression | FunctionDeclaration | null}
 */
function findFunction(context, id) {
  const calleeVariable = findVariable(context, id)
  if (!calleeVariable) {
    return null
  }
  if (calleeVariable.defs.length === 1) {
    const def = calleeVariable.defs[0]
    if (def.node.type === 'FunctionDeclaration') {
      return def.node
    }
    if (
      def.type === 'Variable' &&
      def.parent.kind === 'const' &&
      def.node.init
    ) {
      if (
        def.node.init.type === 'FunctionExpression' ||
        def.node.init.type === 'ArrowFunctionExpression'
      ) {
        return def.node.init
      }
      if (def.node.init.type === 'Identifier') {
        return findFunction(context, def.node.init)
      }
    }
  }
  return null
}

/**
 * @typedef { (context: RuleContext) => ReferenceProperties } ReferencePropertiesTracker
 * @typedef { { node: CallExpression, index: number } } CallAndParamIndex
 * @typedef { { name: string, node: ASTNode, tracker: ReferencePropertiesTracker } } Ref
 */

/**
 * Collects the property reference names.
 */
class ReferenceProperties {
  constructor() {
    /** @type { Ref[] } */
    this.list = []
    /** @type {CallAndParamIndex[]} */
    this.calls = []
  }

  /**
   * @param {string} name
   * @param {ASTNode} node
   * @param {ReferencePropertiesTracker | null} tracker
   */
  addReference(name, node, tracker) {
    this.list.push({
      name,
      node,
      tracker: tracker || (() => EMPTY_REFS)
    })
  }

  /**
   * @returns {IterableIterator<Ref>}
   */
  *iterateRefs() {
    yield* this.list
  }

  /**
   * @param {string} name
   * @returns {ReferencePropertiesTracker}
   */
  getRefTracker(name) {
    return (context) => {
      const refs = this.list.filter((r) => r.name === name)
      const result = new ReferenceProperties()
      for (const { tracker } of refs) {
        result.merge(tracker(context))
      }
      return result
    }
  }

  /**
   * @param { (ReferenceProperties | null)[] } others
   */
  merge(...others) {
    for (const other of others) {
      if (!other) {
        continue
      }
      this.list.push(...other.list)
      this.calls.push(...other.calls)
    }
  }
}
const EMPTY_REFS = new ReferenceProperties()

/**
 * Collects the property reference names for parameters of the function.
 */
class ParamsReferenceProperties {
  /**
   * @param {FunctionDeclaration | FunctionExpression | ArrowFunctionExpression} node
   * @param {RuleContext} context
   */
  constructor(node, context) {
    this.node = node
    this.context = context
    /** @type {ReferenceProperties[]} */
    this.params = []
  }

  /**
   * @param {number} index
   * @returns {ReferenceProperties | null}
   */
  getParam(index) {
    const param = this.params[index]
    if (param != null) {
      return param
    }
    if (this.node.params[index]) {
      return (this.params[index] = extractParamProperties(
        this.node.params[index],
        this.context
      ))
    }
    return null
  }
}
/**
 * Extract the property reference name from one parameter of the function.
 * @param {Pattern} node
 * @param {RuleContext} context
 * @returns {ReferenceProperties}
 */
function extractParamProperties(node, context) {
  while (node.type === 'AssignmentPattern') {
    node = node.left
  }
  if (node.type === 'RestElement' || node.type === 'ArrayPattern') {
    // cannot check
    return EMPTY_REFS
  }
  if (node.type === 'ObjectPattern') {
    return extractObjectPatternProperties(node)
  }
  if (node.type !== 'Identifier') {
    return EMPTY_REFS
  }
  const variable = findVariable(context, node)
  if (!variable) {
    return EMPTY_REFS
  }
  const result = new ReferenceProperties()
  for (const reference of variable.references) {
    const id = reference.identifier
    result.merge(extractPatternOrThisProperties(id, context, false))
  }

  return result
}

/**
 * Extract the property reference name from ObjectPattern.
 * @param {ObjectPattern} node
 * @returns {ReferenceProperties}
 */
function extractObjectPatternProperties(node) {
  const result = new ReferenceProperties()
  for (const prop of node.properties) {
    if (prop.type === 'Property') {
      const name = utils.getStaticPropertyName(prop)
      if (name) {
        result.addReference(
          name,
          prop.key,
          getObjectPatternPropertyPatternTracker(prop.value)
        )
      }
    }
  }
  return result
}

/**
 * Extract the property reference name from id.
 * @param {Identifier} node
 * @param {RuleContext} context
 * @returns {ReferenceProperties}
 */
function extractIdentifierProperties(node, context) {
  const variable = findVariable(context, node)
  if (!variable) {
    return EMPTY_REFS
  }
  const result = new ReferenceProperties()
  for (const reference of variable.references) {
    const id = reference.identifier
    result.merge(extractPatternOrThisProperties(id, context, false))
  }
  return result
}
/**
 * Extract the property reference name from pattern or `this`.
 * @param {Identifier | MemberExpression | ChainExpression | ThisExpression} node
 * @param {RuleContext} context
 * @param {boolean} withInTemplate
 * @returns {ReferenceProperties}
 */
function extractPatternOrThisProperties(node, context, withInTemplate) {
  const parent = node.parent
  if (parent.type === 'AssignmentExpression') {
    if (withInTemplate) {
      return EMPTY_REFS
    }
    if (parent.right === node && parent.left.type === 'ObjectPattern') {
      // `({foo} = arg)`
      return extractObjectPatternProperties(parent.left)
    }
  } else if (parent.type === 'VariableDeclarator') {
    if (withInTemplate) {
      return EMPTY_REFS
    }
    if (parent.init === node) {
      if (parent.id.type === 'ObjectPattern') {
        // `const {foo} = arg`
        return extractObjectPatternProperties(parent.id)
      } else if (parent.id.type === 'Identifier') {
        // `const foo = arg`
        return extractIdentifierProperties(parent.id, context)
      }
    }
  } else if (parent.type === 'MemberExpression') {
    if (parent.object === node) {
      // `arg.foo`
      const name = utils.getStaticPropertyName(parent)
      if (name) {
        const result = new ReferenceProperties()
        result.addReference(name, parent.property, () =>
          extractPatternOrThisProperties(parent, context, withInTemplate)
        )
        return result
      }
    }
  } else if (parent.type === 'CallExpression') {
    if (withInTemplate) {
      return EMPTY_REFS
    }
    const argIndex = parent.arguments.indexOf(node)
    if (argIndex > -1) {
      // `foo(arg)`
      const result = new ReferenceProperties()
      result.calls.push({
        node: parent,
        index: argIndex
      })
      return result
    }
  } else if (parent.type === 'ChainExpression') {
    return extractPatternOrThisProperties(parent, context, withInTemplate)
  }
  return EMPTY_REFS
}

/**
 * @param {Pattern} pattern
 * @returns {ReferencePropertiesTracker}
 */
function getObjectPatternPropertyPatternTracker(pattern) {
  if (pattern.type === 'ObjectPattern') {
    return () => extractObjectPatternProperties(pattern)
  }
  if (pattern.type === 'Identifier') {
    return (context) => extractIdentifierProperties(pattern, context)
  } else if (pattern.type === 'AssignmentPattern') {
    return getObjectPatternPropertyPatternTracker(pattern.left)
  }
  return () => EMPTY_REFS
}

/**
 * @param {ObjectExpression} object
 * @returns {Map<string, Property> | null}
 */
function getObjectPropertyMap(object) {
  /** @type {Map<string, Property>} */
  const props = new Map()
  for (const p of object.properties) {
    if (p.type !== 'Property') {
      return null
    }
    const name = utils.getStaticPropertyName(p)
    if (name == null) {
      return null
    }
    props.set(name, p)
  }
  return props
}

/**
 * @param {Property | undefined} property
 * @returns {PropertyData | null}
 */
function getPropertyDataFromObjectProperty(property) {
  if (property == null) {
    return null
  }
  const propertyMap =
    property.value.type === 'ObjectExpression'
      ? getObjectPropertyMap(property.value)
      : null
  return {
    hasNestProperty: !propertyMap,
    get(name) {
      if (!propertyMap) {
        return null
      }
      return getPropertyDataFromObjectProperty(propertyMap.get(name))
    }
  }
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow undefined properties',
      categories: undefined,
      url: 'https://eslint.vuejs.org/rules/no-undef-properties.html'
    },
    fixable: null,
    schema: [
      {
        type: 'object',
        properties: {
          ignores: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      undef: "'{{name}}' is not defined."
    }
  },
  /** @param {RuleContext} context */
  create(context) {
    const options = context.options[0] || {}
    const ignores = /** @type {string[]} */ (options.ignores || ['/^\\$/']).map(
      toRegExp
    )

    /** @type {Map<FunctionDeclaration | FunctionExpression | ArrowFunctionExpression, ParamsReferenceProperties>} */
    const paramsReferencePropertiesMap = new Map()
    /** @type {Map<ASTNode, VueComponentPropertiesContainer>} */
    const vueComponentPropertiesContainerMap = new Map()

    /**
     * @param {ASTNode} node
     * @param {string} name
     */
    function report(node, name) {
      if (
        reserved.includes(name) ||
        ignores.some((ignore) => ignore.test(name))
      ) {
        return
      }
      context.report({
        node,
        messageId: 'undef',
        data: {
          name
        }
      })
    }

    /**
     * @param {FunctionDeclaration | FunctionExpression | ArrowFunctionExpression} node
     * @returns {ParamsReferenceProperties}
     */
    function getParamsReferenceProperties(node) {
      let usedProps = paramsReferencePropertiesMap.get(node)
      if (!usedProps) {
        usedProps = new ParamsReferenceProperties(node, context)
        paramsReferencePropertiesMap.set(node, usedProps)
      }
      return usedProps
    }

    /**
     * @param {ASTNode} node
     * @returns {VueComponentPropertiesContainer}
     */
    function getVueComponentPropertiesContainer(node) {
      let container = vueComponentPropertiesContainerMap.get(node)
      if (!container) {
        container = {
          properties: new Map()
        }
        vueComponentPropertiesContainerMap.set(node, container)
      }
      return container
    }

    /**
     * @param { { get: (name: string) => PropertyData | null | undefined } } propData
     * @param {ReferenceProperties | null} refs
     * @param {string|null} pathName
     * @param {object} [options]
     * @param {boolean} [options.props]
     */
    function verifyUndefProperties(propData, refs, pathName, options) {
      for (const ref of iterateResolvedRefs(refs)) {
        const prop = propData.get(ref.name)
        if (prop) {
          let valid = true
          if (options && options.props) {
            valid = Boolean(prop.isProps)
          }

          if (valid) {
            if (prop.hasNestProperty) {
              verifyUndefProperties(
                prop,
                ref.tracker(context),
                pathName ? `${pathName}.${ref.name}` : ref.name,
                options
              )
            }
            continue
          }
        }
        report(ref.node, pathName ? `${pathName}.${ref.name}` : ref.name)
      }
    }

    /**
     * @param {ReferenceProperties | null} refs
     * @returns { IterableIterator<Ref> }
     */
    function* iterateResolvedRefs(refs) {
      const already = new Map()

      yield* iterate(refs)

      /**
       * @param {ReferenceProperties | null} refs
       * @returns {IterableIterator<Ref>}
       */
      function* iterate(refs) {
        if (!refs) {
          return
        }
        yield* refs.iterateRefs()
        for (const call of refs.calls) {
          if (call.node.callee.type !== 'Identifier') {
            continue
          }
          const fnNode = findFunction(context, call.node.callee)
          if (!fnNode) {
            continue
          }

          let alreadyIndexes = already.get(fnNode)
          if (!alreadyIndexes) {
            alreadyIndexes = new Set()
            already.set(fnNode, alreadyIndexes)
          }
          if (alreadyIndexes.has(call.index)) {
            continue
          }
          alreadyIndexes.add(call.index)
          const paramsRefs = getParamsReferenceProperties(fnNode)
          const paramRefs = paramsRefs.getParam(call.index)
          yield* iterate(paramRefs)
        }
      }
    }

    /**
     * @param {Expression} node
     * @returns {Property|null}
     */
    function getParentProperty(node) {
      if (
        !node.parent ||
        node.parent.type !== 'Property' ||
        node.parent.value !== node
      ) {
        return null
      }
      const property = node.parent
      if (!utils.isProperty(property)) {
        return null
      }
      return property
    }

    const scriptVisitor = utils.compositingVisitors(
      {},
      utils.defineVueVisitor(context, {
        onVueObjectEnter(node) {
          const container = getVueComponentPropertiesContainer(node)

          for (const prop of utils.iterateProperties(
            node,
            new Set(['props', 'data', 'computed', 'setup', 'methods', 'inject'])
          )) {
            const propertyMap =
              prop.groupName === 'data' &&
              prop.type === 'object' &&
              prop.property.value.type === 'ObjectExpression'
                ? getObjectPropertyMap(prop.property.value)
                : null
            container.properties.set(prop.name, {
              hasNestProperty: Boolean(propertyMap),
              isProps: prop.groupName === 'props',
              get(name) {
                if (!propertyMap) {
                  return null
                }
                return getPropertyDataFromObjectProperty(propertyMap.get(name))
              }
            })
          }

          for (const watcher of utils.iterateProperties(
            node,
            new Set(['watch'])
          )) {
            // Process `watch: { foo /* <- this */ () {} }`
            const segments = watcher.name.split('.')

            const propData = container.properties.get(segments[0])
            if (!propData) {
              report(watcher.node, segments[0])
            } else {
              let targetPropData = propData
              let index = 1
              while (
                targetPropData.hasNestProperty &&
                index < segments.length
              ) {
                const nestPropData = targetPropData.get(segments[index])
                if (!nestPropData) {
                  report(watcher.node, segments.slice(0, index + 1).join('.'))
                  break
                } else {
                  index++
                  targetPropData = nestPropData
                }
              }
            }

            // Process `watch: { x: 'foo' /* <- this */  }`
            if (watcher.type === 'object') {
              const property = watcher.property
              if (property.kind === 'init') {
                for (const handlerValueNode of utils.iterateWatchHandlerValues(
                  property
                )) {
                  if (
                    handlerValueNode.type === 'Literal' ||
                    handlerValueNode.type === 'TemplateLiteral'
                  ) {
                    const name = utils.getStringLiteralValue(handlerValueNode)
                    if (name != null && !container.properties.get(name)) {
                      report(handlerValueNode, name)
                    }
                  }
                }
              }
            }
          }
        },
        /** @param { (FunctionExpression | ArrowFunctionExpression) & { parent: Property }} node */
        'ObjectExpression > Property > :function[params.length>0]'(
          node,
          vueData
        ) {
          let props = false
          const property = getParentProperty(node)
          if (!property) {
            return
          }
          if (property.parent === vueData.node) {
            if (utils.getStaticPropertyName(property) !== 'data') {
              return
            }
            // check { data: (vm) => vm.prop }
            props = true
          } else {
            const parentProperty = getParentProperty(property.parent)
            if (!parentProperty) {
              return
            }
            if (parentProperty.parent === vueData.node) {
              if (utils.getStaticPropertyName(parentProperty) !== 'computed') {
                return
              }
              // check { computed: { foo: (vm) => vm.prop } }
            } else {
              const parentParentProperty = getParentProperty(
                parentProperty.parent
              )
              if (!parentParentProperty) {
                return
              }
              if (parentParentProperty.parent === vueData.node) {
                if (
                  utils.getStaticPropertyName(parentParentProperty) !==
                    'computed' ||
                  utils.getStaticPropertyName(property) !== 'get'
                ) {
                  return
                }
                // check { computed: { foo: { get: (vm) => vm.prop } } }
              } else {
                return
              }
            }
          }

          const paramsRefs = getParamsReferenceProperties(node)
          const refs = paramsRefs.getParam(0)
          const container = getVueComponentPropertiesContainer(vueData.node)
          verifyUndefProperties(container.properties, refs, null, { props })
        },
        onSetupFunctionEnter(node, vueData) {
          const container = getVueComponentPropertiesContainer(vueData.node)
          const paramsRefs = getParamsReferenceProperties(node)
          const paramRefs = paramsRefs.getParam(0)
          verifyUndefProperties(container.properties, paramRefs, null, {
            props: true
          })
        },
        onRenderFunctionEnter(node, vueData) {
          const container = getVueComponentPropertiesContainer(vueData.node)

          // Check for Vue 3.x render
          const paramsRefs = getParamsReferenceProperties(node)
          const ctxRefs = paramsRefs.getParam(0)
          verifyUndefProperties(container.properties, ctxRefs, null, {
            props: true
          })

          if (vueData.functional) {
            // Check for Vue 2.x render & functional
            const propsRefs = new ReferenceProperties()
            for (const ref of iterateResolvedRefs(paramsRefs.getParam(1))) {
              if (ref.name === 'props') {
                propsRefs.merge(ref.tracker(context))
              }
            }
            verifyUndefProperties(container.properties, propsRefs, null, {
              props: true
            })
          }
        },
        /**
         * @param {ThisExpression | Identifier} node
         * @param {VueObjectData} vueData
         */
        'ThisExpression, Identifier'(node, vueData) {
          if (!utils.isThis(node, context)) {
            return
          }
          const container = getVueComponentPropertiesContainer(vueData.node)
          const usedProps = extractPatternOrThisProperties(node, context, false)
          verifyUndefProperties(container.properties, usedProps, null)
        }
      })
    )

    const templateVisitor = {
      /**
       * @param {VExpressionContainer} node
       */
      VExpressionContainer(node) {
        const refs = new ReferenceProperties()
        for (const id of getReferences(node.references)) {
          refs.addReference(id.name, id, (context) =>
            extractPatternOrThisProperties(id, context, true)
          )
        }

        const exported = [...vueComponentPropertiesContainerMap.keys()].find(
          isExportObject
        )
        const vueObject =
          exported && vueComponentPropertiesContainerMap.get(exported)

        if (vueObject) {
          verifyUndefProperties(vueObject.properties, refs, null)
        }

        /**
         * @param {ASTNode} node
         */
        function isExportObject(node) {
          let parent = node.parent
          while (parent) {
            if (parent.type === 'ExportDefaultDeclaration') {
              return true
            }
            parent = parent.parent
          }
          return false
        }
      }
    }

    return utils.defineTemplateBodyVisitor(
      context,
      templateVisitor,
      scriptVisitor
    )
  }
}
