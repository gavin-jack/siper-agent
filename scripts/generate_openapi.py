#!/usr/bin/env python3
"""Generate the OpenAPI JSON spec from the router's register_routes function."""
import re, json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ai_agent.api.router import register_routes, Router

def parse_router(router_path):
    with open(router_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Match all @router.method('/api/xxx') decorated functions
    pattern = r'@router\.(\w+)\(["\'](/api/[^"\']+)["\'].*?\)\s*\n\s*def\s+(\w+)\((.*?)\):'
    matches = re.findall(pattern, content, re.DOTALL)

    routes = []
    for method, path, func, params_str in matches:
        method = method.upper()
        if method not in ('GET', 'POST', 'PUT', 'DELETE', 'PATCH'):
            continue
        params = re.findall(r'(\w+)\s*:\s*[^=,]+(?:\s*=\s*[^,]+)?', params_str) if params_str.strip() else []
        routes.append({
            'method': method,
            'path': path,
            'func': func,
            'params': params,
            'description': func.replace('api_', '').replace('_', ' ').title(),
        })
    return routes

def params_to_params(params):
    result = []
    for p in params:
        result.append({
            'name': p,
            'in': 'query',
            'required': False,
            'schema': {'type': 'string'},
        })
    return result

def generate_openapi(routes, title='SiPer AI Agent API', version='1.0.0'):
    paths = {}
    for r in routes:
        path = r['path']
        method = r['method'].lower()

        if path not in paths:
            paths[path] = {}

        parts = path.strip('/').split('/')
        tag = parts[1] if len(parts) > 1 else 'default'

        operation = {
            'summary': r['description'] or r['func'],
            'operationId': r['func'],
            'tags': [tag],
            'responses': {
                '200': {'description': 'Success'},
                '500': {'description': 'Internal Server Error'},
            },
        }

        path_params = re.findall(r'\{(\\w+)\}', path)
        params = []
        for pp in path_params:
            params.append({
                'name': pp,
                'in': 'path',
                'required': True,
                'schema': {'type': 'string'},
            })

        for p in params_to_params(r['params']):
            if p['name'] not in [pp[0] for pp in re.findall(r'\{(\\w+)\}', path)]:
                params.append(p)

        if params:
            operation['parameters'] = params

        if r['method'] in ('POST', 'PUT', 'PATCH'):
            operation['requestBody'] = {
                'content': {
                    'application/json': {
                        'schema': {'type': 'object'}
                    }
                }
            }

        paths[path][method] = operation

    spec = {
        'openapi': '3.0.3',
        'info': {
            'title': title,
            'version': version,
            'description': 'SiPer AI Agent RESTful API — 由 router.py 装饰器自动生成',
        },
        'servers': [
            {'url': 'http://127.0.0.1:9724', 'description': '开发服务器'}
        ],
        'paths': dict(sorted(paths.items())),
    }

    return spec

def main():
    router_path = os.path.join(os.path.dirname(__file__), '..', 'ai_agent', 'api', 'router.py')
    routes = parse_router(router_path)

    if not routes:
        print('ERROR: No routes found. Check regex pattern.', file=sys.stderr)
        sys.exit(1)

    # Use Chinese localized title for OpenAPI spec
    spec = generate_openapi(routes, title='SiPer AI Agent API', version='1.0.0')
    print(json.dumps(spec, indent=2, ensure_ascii=False))
    print(f'\n--- {len(routes)} routes parsed ---', file=sys.stderr)

if __name__ == '__main__':
    main()
