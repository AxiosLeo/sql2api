export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type OpenApiObject = { [key: string]: JsonValue }

export interface OpenApiParameter {
  name: string
  in: string
  required?: boolean
  description?: string
  schema?: OpenApiObject
  $ref?: string
}

export interface ParsedOperation {
  tag: string
  method: string
  path: string
  summary: string
  description: string
  operationId: string
  parameters: OpenApiParameter[]
  requestBodyExample: string | null
  responses: { status: string; description: string }[]
  security: boolean
}

export function resolveRef(
  spec: OpenApiObject,
  ref: string
): OpenApiObject | null {
  if (!ref.startsWith('#/')) return null
  const parts = ref.slice(2).split('/')
  let current: JsonValue = spec
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null
    }
    current = (current as OpenApiObject)[part]
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    return null
  }
  return current as OpenApiObject
}

function mergeAllOf(
  spec: OpenApiObject,
  schemas: OpenApiObject[]
): OpenApiObject {
  const merged: OpenApiObject = { type: 'object', properties: {} }
  const required = new Set<string>()
  for (const item of schemas) {
    const resolved = item.$ref
      ? resolveRef(spec, String(item.$ref)) || item
      : item
    if (resolved.properties && typeof resolved.properties === 'object') {
      Object.assign(
        merged.properties as OpenApiObject,
        resolved.properties as OpenApiObject
      )
    }
    if (Array.isArray(resolved.required)) {
      for (const r of resolved.required) {
        if (typeof r === 'string') required.add(r)
      }
    }
    if (resolved.type && !merged.type) {
      merged.type = resolved.type
    }
  }
  if (required.size > 0) {
    merged.required = Array.from(required)
  }
  return merged
}

export function schemaToExample(
  spec: OpenApiObject,
  schema: OpenApiObject | null | undefined,
  depth = 0
): unknown {
  if (!schema || depth > 6) return null

  if (typeof schema.$ref === 'string') {
    return schemaToExample(spec, resolveRef(spec, schema.$ref), depth + 1)
  }

  if (Array.isArray(schema.allOf)) {
    return schemaToExample(
      spec,
      mergeAllOf(spec, schema.allOf as OpenApiObject[]),
      depth + 1
    )
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return schemaToExample(
      spec,
      schema.oneOf[0] as OpenApiObject,
      depth + 1
    )
  }

  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0]
  }

  switch (schema.type) {
    case 'object': {
      const props = (schema.properties || {}) as OpenApiObject
      const obj: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(props)) {
        obj[key] = schemaToExample(spec, value as OpenApiObject, depth + 1)
      }
      return obj
    }
    case 'array':
      return [
        schemaToExample(
          spec,
          (schema.items as OpenApiObject) || { type: 'string' },
          depth + 1
        ),
      ]
    case 'integer':
      return 1
    case 'number':
      return 1.0
    case 'boolean':
      return true
    default:
      return 'string'
  }
}

function resolveParameter(
  spec: OpenApiObject,
  param: OpenApiObject
): OpenApiParameter {
  if (typeof param.$ref === 'string') {
    const resolved = resolveRef(spec, param.$ref)
    if (resolved) {
      return resolveParameter(spec, resolved)
    }
  }
  return {
    name: String(param.name || ''),
    in: String(param.in || 'query'),
    required: Boolean(param.required),
    description:
      typeof param.description === 'string' ? param.description : undefined,
    schema: (param.schema as OpenApiObject) || undefined,
  }
}

function responseDescription(
  spec: OpenApiObject,
  response: OpenApiObject
): string {
  if (typeof response.$ref === 'string') {
    const resolved = resolveRef(spec, response.$ref)
    if (resolved && typeof resolved.description === 'string') {
      return resolved.description
    }
    return response.$ref
  }
  return typeof response.description === 'string'
    ? response.description
    : ''
}

export function parseOperations(spec: OpenApiObject): ParsedOperation[] {
  const paths = (spec.paths || {}) as OpenApiObject
  const result: ParsedOperation[] = []
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue
    const item = pathItem as OpenApiObject
    for (const method of methods) {
      const op = item[method]
      if (!op || typeof op !== 'object') continue
      const operation = op as OpenApiObject
      const tags = Array.isArray(operation.tags)
        ? (operation.tags as string[])
        : ['default']

      const parameters: OpenApiParameter[] = []
      if (Array.isArray(operation.parameters)) {
        for (const p of operation.parameters) {
          parameters.push(resolveParameter(spec, p as OpenApiObject))
        }
      }

      let requestBodyExample: string | null = null
      const requestBody = operation.requestBody as OpenApiObject | undefined
      if (requestBody) {
        const body =
          typeof requestBody.$ref === 'string'
            ? resolveRef(spec, requestBody.$ref)
            : requestBody
        const content = (body?.content || {}) as OpenApiObject
        const json = content['application/json'] as OpenApiObject | undefined
        if (json) {
          if (json.example !== undefined) {
            requestBodyExample = JSON.stringify(json.example, null, 2)
          } else if (json.schema) {
            requestBodyExample = JSON.stringify(
              schemaToExample(spec, json.schema as OpenApiObject),
              null,
              2
            )
          }
        }
      }

      const responsesObj = (operation.responses || {}) as OpenApiObject
      const responses = Object.entries(responsesObj).map(
        ([status, response]) => ({
          status,
          description: responseDescription(
            spec,
            (response || {}) as OpenApiObject
          ),
        })
      )

      for (const tag of tags) {
        result.push({
          tag: String(tag),
          method: method.toUpperCase(),
          path,
          summary:
            typeof operation.summary === 'string' ? operation.summary : '',
          description:
            typeof operation.description === 'string'
              ? operation.description
              : '',
          operationId:
            typeof operation.operationId === 'string'
              ? operation.operationId
              : '',
          parameters,
          requestBodyExample,
          responses,
          security: Array.isArray(operation.security)
            ? operation.security.length > 0
            : Array.isArray(spec.security)
              ? (spec.security as unknown[]).length > 0
              : false,
        })
      }
    }
  }

  return result
}

export function groupByTag(
  operations: ParsedOperation[]
): Map<string, ParsedOperation[]> {
  const map = new Map<string, ParsedOperation[]>()
  for (const op of operations) {
    const list = map.get(op.tag) || []
    list.push(op)
    map.set(op.tag, list)
  }
  return map
}

export function buildCurl(
  op: ParsedOperation,
  serverUrl: string
): string {
  const base = serverUrl.replace(/\/$/, '')
  const url = `${base}${op.path}`
  const lines = [`curl -X ${op.method} '${url}'`]

  if (op.security) {
    lines.push(`  -H 'Authorization: Bearer <api-key>'`)
  }

  if (op.requestBodyExample && ['POST', 'PUT', 'PATCH'].includes(op.method)) {
    lines.push(`  -H 'Content-Type: application/json'`)
    lines.push(`  -d '${op.requestBodyExample.replace(/'/g, "'\\''")}'`)
  }

  return lines.join(' \\\n')
}

export function schemaTypeLabel(schema?: OpenApiObject): string {
  if (!schema) return '—'
  if (typeof schema.$ref === 'string') {
    const parts = schema.$ref.split('/')
    return parts[parts.length - 1] || 'ref'
  }
  if (schema.type) return String(schema.type)
  if (Array.isArray(schema.enum)) return 'enum'
  return '—'
}
