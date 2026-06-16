#!/usr/bin/env python3
"""从 router.py 的装饰器自动生成 OpenAPI 3.0 JSON 文档"""

import re
import json
import sys

def parse_router(filepath):
    with open(filepath) as f:
        content = f.read()

    # Find @router.(method)("path") followed by def func(...)
    # The decorator and def are separated by a newline
    pattern = re.compile(
        r'@router\.(get|post|put|delete|patch)\("([^"]+)"\)\s*\n'
        r'    def\s+(\w+)\s*\(([^)]*)\)\s*:',
        re.MULTILINE
    )

    routes = []
    for m in pattern.finditer(content):
        method, path, func_name, params = m.groups()

        # Try to find a docstring after the def line
        after = content[m.end():]
        doc_match = re.match(r'\s*\n\s*"""([^"]*)"""', after)
        docstring = doc_match.group(1).strip() if doc_match else ''

        routes.append({
            'method': method.upper(),
            'path': path,
            'func': func_name,
            'params': params.strip(),
            'description': docstring,
        })

    return routes

def params_to_params(params_str):
    """Convert function parameter list to OpenAPI parameters"""
    if not params_str:
        return []
    result = []
    for p in params_str.split(','):
        p = p.strip()
        if p in ('body', 'self'):
            continue
        if '=' in p:
            p = p.split('=')[0].strip()
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

        # Extract path-level tag from /api/{tag}/...
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

        # Path parameters
        path_params = re.findall(r'\{(\w+)\}', path)
        params = []
        for pp in path_params:
            params.append({
                'name': pp,
                'in': 'path',
                'required': True,
                'schema': {'type': 'string'},
            })

        # Query/body parameters
        for p in params_to_params(r['params']):
            if p['name'] not in [pp[0] for pp in re.findall(r'\{(\w+)\}', path)]:
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
            'description': 'SiPer AI Agent RESTful API — auto-generated from router.py decorators',
        },
        'servers': [
            {'url': 'http://127.0.0.1:9724', 'description': 'Development server'}
        ],
        'paths': dict(sorted(paths.items())),
    }

    return spec

def main():
    router_path = '/home/gavin/.siper/ai_agent/api/router.py'
    routes = parse_router(router_path)

    if not routes:
        print('ERROR: No routes found. Check regex pattern.', file=sys.stderr)
        sys.exit(1)

    spec = generate_openapi(routes)
    print(json.dumps(spec, indent=2, ensure_ascii=False))
    print(f'\n--- {len(routes)} routes parsed ---', file=sys.stderr)

if __name__ == '__main__':
    main()
