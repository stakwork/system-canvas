import type { CanvasData } from 'system-canvas'

/**
 * Root canvas: an organization-level system diagram.
 * Some nodes have `ref` pointing to sub-canvases.
 */
export const rootCanvas: CanvasData = {
  theme: {
    base: 'dark',
    categories: {
      service: {
        defaultWidth: 140,
        defaultHeight: 60,
        fill: 'rgba(6, 78, 59, 0.4)',
        stroke: '#34d399',
        cornerRadius: 6,
        icon: 'server',
      },
      database: {
        defaultWidth: 140,
        defaultHeight: 60,
        fill: 'rgba(76, 29, 149, 0.4)',
        stroke: '#a78bfa',
        cornerRadius: 6,
        icon: 'database',
      },
      frontend: {
        defaultWidth: 140,
        defaultHeight: 60,
        fill: 'rgba(8, 51, 68, 0.4)',
        stroke: '#22d3ee',
        cornerRadius: 6,
        icon: 'globe',
      },
    },
  },
  nodes: [
    // Group: Engineering
    {
      id: 'eng-group',
      type: 'group',
      x: -30,
      y: -30,
      width: 590,
      height: 330,
      label: 'Engineering',
      color: '5',
    },

    // Services (top row: y=20)
    {
      id: 'api-gateway',
      type: 'text',
      text: 'API Gateway\nNginx + Kong',
      x: 0,
      y: 20,
      width: 140,
      height: 60,
      color: '4',
      ref: 'canvas:api-gateway',
      category: 'service',
    },
    {
      id: 'auth-service',
      type: 'text',
      text: 'Auth Service\nOAuth2 / JWT',
      x: 200,
      y: 20,
      width: 140,
      height: 60,
      color: '1',
      category: 'service',
    },
    {
      id: 'user-service',
      type: 'text',
      text: 'User Service\nRust / Axum',
      x: 400,
      y: 20,
      width: 140,
      height: 60,
      color: '4',
      ref: 'canvas:user-service',
      category: 'service',
    },

    // Databases (middle row: y=120)
    {
      id: 'postgres',
      type: 'text',
      text: 'PostgreSQL\nPrimary',
      x: 80,
      y: 120,
      width: 140,
      height: 60,
      color: '6',
      category: 'database',
    },
    {
      id: 'redis',
      type: 'text',
      text: 'Redis\nCache + Sessions',
      x: 300,
      y: 120,
      width: 140,
      height: 60,
      color: '2',
      category: 'database',
    },

    // Message bus (bottom row: y=220)
    {
      id: 'kafka',
      type: 'text',
      text: 'Kafka',
      x: 180,
      y: 220,
      width: 160,
      height: 30,
      color: '2',
    },

    // Group: Infrastructure
    {
      id: 'infra-group',
      type: 'group',
      x: 600,
      y: -30,
      width: 210,
      height: 400,
      label: 'Infrastructure',
      color: '3',
    },

    // Infra nodes (stacked vertically)
    {
      id: 'k8s',
      type: 'text',
      text: 'Kubernetes\nEKS Cluster',
      x: 620,
      y: 20,
      width: 170,
      height: 60,
      color: '5',
      ref: 'canvas:k8s',
    },
    {
      id: 'monitoring',
      type: 'text',
      text: 'Monitoring\nPrometheus + Grafana',
      x: 620,
      y: 110,
      width: 170,
      height: 60,
      color: '3',
      ref: 'canvas:monitoring',
    },
    {
      id: 'ci-cd',
      type: 'text',
      text: 'CI/CD\nGitHub Actions',
      x: 620,
      y: 200,
      width: 170,
      height: 60,
      color: '3',
    },
    {
      id: 'platform-team',
      type: 'text',
      text: 'Platform Team\n4 Engineers',
      x: 620,
      y: 290,
      width: 170,
      height: 50,
    },

    // External (outside both groups)
    {
      id: 'clients',
      type: 'text',
      text: 'Clients\nWeb + Mobile',
      x: -230,
      y: 20,
      width: 140,
      height: 60,
      category: 'frontend',
    },
  ],

  edges: [
    {
      id: 'e1',
      fromNode: 'clients',
      fromSide: 'right',
      toNode: 'api-gateway',
      toSide: 'left',
      label: 'HTTPS',
      animated: true,
    },
    {
      id: 'e2',
      fromNode: 'api-gateway',
      fromSide: 'right',
      toNode: 'auth-service',
      toSide: 'left',
      label: 'Auth',
    },
    {
      id: 'e2r',
      fromNode: 'auth-service',
      fromSide: 'left',
      toNode: 'api-gateway',
      toSide: 'right',
      label: 'token',
      animated: true,
    },
    {
      id: 'e3',
      fromNode: 'api-gateway',
      toNode: 'user-service',
      label: 'gRPC',
    },
    {
      id: 'e4',
      fromNode: 'auth-service',
      fromSide: 'bottom',
      toNode: 'redis',
      toSide: 'top',
      label: 'Sessions',
    },
    {
      id: 'e5',
      fromNode: 'user-service',
      fromSide: 'bottom',
      toNode: 'postgres',
      toSide: 'right',
    },
    {
      id: 'e6',
      fromNode: 'user-service',
      fromSide: 'bottom',
      toNode: 'redis',
      toSide: 'right',
    },
    {
      id: 'e7',
      fromNode: 'api-gateway',
      fromSide: 'bottom',
      toNode: 'postgres',
      toSide: 'top',
    },
    {
      id: 'e8',
      fromNode: 'postgres',
      fromSide: 'bottom',
      toNode: 'kafka',
      toSide: 'left',
      label: 'CDC',
      animated: true,
    },
    {
      id: 'e9',
      fromNode: 'k8s',
      fromSide: 'left',
      toNode: 'user-service',
      toSide: 'right',
      label: 'deploys',
      color: '5',
    },
    {
      id: 'e10',
      fromNode: 'ci-cd',
      fromSide: 'left',
      toNode: 'kafka',
      toSide: 'right',
      color: '3',
    },
    {
      id: 'e11',
      fromNode: 'monitoring',
      fromSide: 'left',
      toNode: 'redis',
      toSide: 'right',
      label: 'metrics',
      color: '3',
      animated: true,
    },
  ],
}

/**
 * Sub-canvas: API Gateway internals
 */
export const apiGatewayCanvas: CanvasData = {
  nodes: [
    {
      id: 'group-gw',
      type: 'group',
      x: -20,
      y: -20,
      width: 700,
      height: 260,
      label: 'API Gateway Internals',
      color: '4',
    },
    {
      id: 'nginx',
      type: 'text',
      text: 'Nginx\nReverse Proxy',
      x: 0,
      y: 30,
      width: 180,
      height: 55,
      color: '4',
    },
    {
      id: 'kong',
      type: 'text',
      text: 'Kong\nAPI Management',
      x: 240,
      y: 30,
      width: 180,
      height: 55,
      color: '4',
    },
    {
      id: 'rate-limiter',
      type: 'text',
      text: 'Rate Limiter\nRedis-backed',
      x: 0,
      y: 130,
      width: 180,
      height: 55,
      color: '1',
    },
    {
      id: 'cors',
      type: 'text',
      text: 'CORS\nMiddleware',
      x: 240,
      y: 130,
      width: 180,
      height: 55,
      color: '1',
    },
    {
      id: 'lb',
      type: 'text',
      text: 'Load Balancer\nRound Robin',
      x: 480,
      y: 30,
      width: 180,
      height: 55,
      color: '5',
    },
  ],
  edges: [
    { id: 'gw-e1', fromNode: 'nginx', toNode: 'kong' },
    { id: 'gw-e2', fromNode: 'kong', toNode: 'lb' },
    { id: 'gw-e3', fromNode: 'kong', fromSide: 'bottom', toNode: 'rate-limiter', toSide: 'top' },
    { id: 'gw-e4', fromNode: 'kong', fromSide: 'bottom', toNode: 'cors', toSide: 'top' },
  ],
}

/**
 * Sub-canvas: Kubernetes cluster
 */
export const k8sCanvas: CanvasData = {
  nodes: [
    {
      id: 'k8s-group',
      type: 'group',
      x: -20,
      y: -20,
      width: 1020,
      height: 480,
      label: 'EKS Cluster',
      color: '5',
    },
    {
      id: 'ns-prod',
      type: 'group',
      x: 0,
      y: 20,
      width: 280,
      height: 200,
      label: 'namespace: production',
      color: '4',
    },
    {
      id: 'ns-staging',
      type: 'group',
      x: 310,
      y: 20,
      width: 280,
      height: 200,
      label: 'namespace: staging',
      color: '3',
    },
    {
      id: 'pod-api-1',
      type: 'text',
      text: 'api-pod-1\nRunning',
      x: 20,
      y: 60,
      width: 110,
      height: 50,
      color: '4',
    },
    {
      id: 'pod-api-2',
      type: 'text',
      text: 'api-pod-2\nRunning',
      x: 150,
      y: 60,
      width: 110,
      height: 50,
      color: '4',
    },
    {
      id: 'pod-worker',
      type: 'text',
      text: 'worker-pod\nRunning',
      x: 20,
      y: 140,
      width: 110,
      height: 50,
      color: '2',
      ref: 'canvas:pod-worker',
    },
    {
      id: 'pod-staging-api',
      type: 'text',
      text: 'api-pod-1\nRunning',
      x: 330,
      y: 60,
      width: 110,
      height: 50,
      color: '3',
    },
    {
      id: 'pod-staging-worker',
      type: 'text',
      text: 'worker-pod\nPending',
      x: 330,
      y: 140,
      width: 110,
      height: 50,
      color: '3',
    },
    {
      id: 'ingress',
      type: 'text',
      text: 'Ingress Controller\nALB',
      x: 200,
      y: 300,
      width: 180,
      height: 50,
      color: '5',
    },

    // Controller API group -- cluster control plane extensions
    {
      id: 'ns-controllers',
      type: 'group',
      x: 640,
      y: 20,
      width: 340,
      height: 420,
      label: 'namespace: controllers',
      color: '6',
    },
    {
      id: 'crd-file',
      type: 'file',
      file: 'k8s/crds/workspace.yaml',
      x: 740,
      y: 390,
      width: 180,
      height: 40,
      color: '6',
    },
    {
      id: 'controller-api',
      type: 'text',
      text: 'Controller API\ngRPC + REST',
      x: 740,
      y: 60,
      width: 140,
      height: 55,
      color: '6',
    },
    {
      id: 'autoscaler',
      type: 'text',
      text: 'Auto-Scaler\nHPA + Custom Metrics',
      x: 660,
      y: 150,
      width: 150,
      height: 55,
      color: '4',
    },
    {
      id: 'workspace-ctrl',
      type: 'text',
      text: 'Workspace Controller\nCRD Reconciler',
      x: 820,
      y: 150,
      width: 150,
      height: 55,
      color: '2',
    },
    {
      id: 'job-scheduler',
      type: 'text',
      text: 'Job Scheduler\nAgent Runs',
      x: 660,
      y: 240,
      width: 150,
      height: 55,
      color: '1',
    },
    {
      id: 'secret-sync',
      type: 'text',
      text: 'Secret Sync\nVault → K8s',
      x: 820,
      y: 240,
      width: 150,
      height: 55,
      color: '5',
    },
    {
      id: 'metrics-collector',
      type: 'text',
      text: 'Metrics Collector\nPrometheus',
      x: 660,
      y: 330,
      width: 150,
      height: 55,
      color: '3',
    },
    {
      id: 'event-bus',
      type: 'text',
      text: 'Event Bus\nNATS',
      x: 820,
      y: 330,
      width: 150,
      height: 55,
      color: '2',
    },
  ],
  edges: [
    { id: 'k-e1', fromNode: 'ingress', fromSide: 'top', toNode: 'pod-api-1', toSide: 'bottom', label: 'route' },
    { id: 'k-e2', fromNode: 'ingress', fromSide: 'top', toNode: 'pod-api-2', toSide: 'bottom' },
    { id: 'k-e3', fromNode: 'pod-api-1', fromSide: 'bottom', toNode: 'pod-worker', toSide: 'top', label: 'jobs' },

    // Controller API wiring
    { id: 'k-e4', fromNode: 'controller-api', fromSide: 'bottom', toNode: 'autoscaler', toSide: 'top', label: 'scale' },
    { id: 'k-e5', fromNode: 'controller-api', fromSide: 'bottom', toNode: 'workspace-ctrl', toSide: 'top', label: 'provision' },
    { id: 'k-e6', fromNode: 'workspace-ctrl', fromSide: 'bottom', toNode: 'job-scheduler', toSide: 'top' },
    { id: 'k-e7', fromNode: 'workspace-ctrl', fromSide: 'bottom', toNode: 'secret-sync', toSide: 'top' },
    { id: 'k-e8', fromNode: 'autoscaler', fromSide: 'bottom', toNode: 'metrics-collector', toSide: 'top', label: 'reads' },
    { id: 'k-e9', fromNode: 'job-scheduler', fromSide: 'bottom', toNode: 'event-bus', toSide: 'top' },
    { id: 'k-e10', fromNode: 'workspace-ctrl', fromSide: 'bottom', toNode: 'crd-file', toSide: 'top', label: 'watches' },

    // Cross-namespace control flow
    { id: 'k-e11', fromNode: 'autoscaler', fromSide: 'left', toNode: 'pod-api-2', toSide: 'right', label: 'scales' },
    { id: 'k-e12', fromNode: 'job-scheduler', fromSide: 'left', toNode: 'pod-worker', toSide: 'right', label: 'dispatches' },
    { id: 'k-e13', fromNode: 'secret-sync', fromSide: 'left', toNode: 'pod-staging-api', toSide: 'right' },
    { id: 'k-e14', fromNode: 'metrics-collector', fromSide: 'left', toNode: 'pod-staging-worker', toSide: 'right', label: 'scrapes' },
  ],
}

/**
 * Sub-canvas: Monitoring stack (Prometheus + Grafana)
 *
 * Intentionally vertically adjacent to the k8s sub-canvas on the root —
 * useful for verifying the zoom-navigation tie-breaking fix (closest node
 * to viewport center wins when two stacked ref-bearing nodes both cross
 * `enterThreshold` in the same frame).
 */
export const monitoringCanvas: CanvasData = {
  nodes: [
    {
      id: 'mon-collect',
      type: 'group',
      x: -20,
      y: -50,
      width: 360,
      height: 320,
      label: 'Collection',
      color: '3',
    },
    {
      id: 'mon-store',
      type: 'group',
      x: 360,
      y: -50,
      width: 280,
      height: 320,
      label: 'Storage',
      color: '5',
    },
    {
      id: 'mon-visualize',
      type: 'group',
      x: 660,
      y: -50,
      width: 300,
      height: 320,
      label: 'Visualization & Alerting',
      color: '4',
    },

    // Collection
    {
      id: 'node-exporter',
      type: 'text',
      text: 'Node Exporter\nHost metrics',
      x: 0,
      y: 0,
      width: 150,
      height: 55,
      color: '3',
    },
    {
      id: 'kube-state',
      type: 'text',
      text: 'kube-state-metrics\nCluster metrics',
      x: 170,
      y: 0,
      width: 150,
      height: 55,
      color: '3',
    },
    {
      id: 'app-metrics',
      type: 'text',
      text: 'App /metrics\nPrometheus client',
      x: 0,
      y: 90,
      width: 150,
      height: 55,
      color: '4',
    },
    {
      id: 'otel-collector',
      type: 'text',
      text: 'OTel Collector\nTraces + logs',
      x: 170,
      y: 90,
      width: 150,
      height: 55,
      color: '2',
    },
    {
      id: 'scrape-config',
      type: 'file',
      file: 'monitoring/scrape.yaml',
      x: 85,
      y: 200,
      width: 180,
      height: 40,
      color: '3',
    },

    // Storage
    {
      id: 'prometheus',
      type: 'text',
      text: 'Prometheus\nTSDB scraper',
      x: 380,
      y: 0,
      width: 160,
      height: 55,
      color: '5',
    },
    {
      id: 'thanos',
      type: 'text',
      text: 'Thanos\nLong-term storage',
      x: 380,
      y: 90,
      width: 160,
      height: 55,
      color: '5',
    },
    {
      id: 'loki',
      type: 'text',
      text: 'Loki\nLog store',
      x: 380,
      y: 180,
      width: 160,
      height: 55,
      color: '6',
    },

    // Visualization & alerting
    {
      id: 'grafana',
      type: 'text',
      text: 'Grafana\nDashboards',
      x: 680,
      y: 0,
      width: 150,
      height: 55,
      color: '4',
    },
    {
      id: 'alertmanager',
      type: 'text',
      text: 'Alertmanager\nRouting + dedup',
      x: 680,
      y: 90,
      width: 150,
      height: 55,
      color: '1',
    },
    {
      id: 'oncall',
      type: 'text',
      text: 'On-call team\n2 rotations',
      x: 680,
      y: 180,
      width: 150,
      height: 45,
    },
  ],
  edges: [
    // Collection -> Prometheus
    { id: 'mon-e1', fromNode: 'node-exporter', fromSide: 'right', toNode: 'prometheus', toSide: 'left', label: 'scrape', animated: true },
    { id: 'mon-e2', fromNode: 'kube-state', fromSide: 'right', toNode: 'prometheus', toSide: 'left' },
    { id: 'mon-e3', fromNode: 'app-metrics', fromSide: 'right', toNode: 'prometheus', toSide: 'left', label: 'scrape', animated: true },
    { id: 'mon-e4', fromNode: 'otel-collector', fromSide: 'right', toNode: 'loki', toSide: 'left', label: 'logs' },
    { id: 'mon-e5', fromNode: 'scrape-config', fromSide: 'right', toNode: 'prometheus', toSide: 'left', label: 'config' },

    // Storage -> Storage
    { id: 'mon-e6', fromNode: 'prometheus', fromSide: 'bottom', toNode: 'thanos', toSide: 'top', label: 'remote write' },

    // Storage -> Visualization
    { id: 'mon-e7', fromNode: 'prometheus', fromSide: 'right', toNode: 'grafana', toSide: 'left', label: 'query' },
    { id: 'mon-e8', fromNode: 'thanos', fromSide: 'right', toNode: 'grafana', toSide: 'left', label: 'query' },
    { id: 'mon-e9', fromNode: 'loki', fromSide: 'right', toNode: 'grafana', toSide: 'left', label: 'logs' },
    { id: 'mon-e10', fromNode: 'prometheus', fromSide: 'right', toNode: 'alertmanager', toSide: 'left', label: 'rules fire' },

    // Alerting fan-out
    { id: 'mon-e11', fromNode: 'alertmanager', fromSide: 'bottom', toNode: 'oncall', toSide: 'top', label: 'page' },
  ],
}

/**
 * Sub-canvas: User Service internals
 */
export const userServiceCanvas: CanvasData = {
  nodes: [
    {
      id: 'us-group',
      type: 'group',
      x: -20,
      y: -50,
      width: 600,
      height: 290,
      label: 'User Service Internals',
      color: '4',
    },
    {
      id: 'handler',
      type: 'text',
      text: 'HTTP Handler\nAxum Router',
      x: 0,
      y: 0,
      width: 140,
      height: 55,
      color: '4',
    },
    {
      id: 'middleware',
      type: 'text',
      text: 'Middleware\nAuth + Logging',
      x: 0,
      y: 90,
      width: 140,
      height: 55,
      color: '1',
    },
    {
      id: 'domain',
      type: 'text',
      text: 'Domain Layer\nBusiness Logic',
      x: 200,
      y: 0,
      width: 140,
      height: 55,
      color: '4',
    },
    {
      id: 'repo',
      type: 'text',
      text: 'Repository\nSQLx',
      x: 200,
      y: 90,
      width: 140,
      height: 55,
      color: '6',
    },
    {
      id: 'events',
      type: 'text',
      text: 'Event Publisher\nKafka Producer',
      x: 400,
      y: 40,
      width: 140,
      height: 55,
      color: '2',
    },

    // File nodes -- source files
    {
      id: 'routes-file',
      type: 'file',
      file: 'src/routes/mod.rs',
      x: 0,
      y: 180,
      width: 150,
      height: 40,
      color: '4',
    },
    {
      id: 'schema-file',
      type: 'file',
      file: 'src/db/schema.sql',
      x: 200,
      y: 180,
      width: 150,
      height: 40,
      color: '6',
    },
    {
      id: 'config-file',
      type: 'file',
      file: 'config/production.toml',
      x: 400,
      y: 130,
      width: 160,
      height: 40,
    },
  ],
  edges: [
    { id: 'us-e1', fromNode: 'handler', toNode: 'domain', label: 'calls' },
    { id: 'us-e2', fromNode: 'handler', fromSide: 'bottom', toNode: 'middleware', toSide: 'top' },
    { id: 'us-e3', fromNode: 'domain', fromSide: 'bottom', toNode: 'repo', toSide: 'top', label: 'queries' },
    { id: 'us-e4', fromNode: 'domain', toNode: 'events', label: 'publishes' },
    { id: 'us-e5', fromNode: 'handler', fromSide: 'bottom', toNode: 'routes-file', toSide: 'top' },
    { id: 'us-e6', fromNode: 'repo', fromSide: 'bottom', toNode: 'schema-file', toSide: 'top' },
  ],
}

/**
 * Sub-canvas: worker-pod — shows the agents running inside the pod.
 */
export const podWorkerCanvas: CanvasData = {
  nodes: [
    {
      id: 'pw-group',
      type: 'group',
      x: -20,
      y: -20,
      width: 700,
      height: 340,
      label: 'worker-pod: agent runtime',
      color: '2',
    },

    // Supervisor / runtime row
    {
      id: 'supervisor',
      type: 'text',
      text: 'Agent Supervisor\nTokio runtime',
      x: 0,
      y: 20,
      width: 180,
      height: 55,
      color: '2',
    },
    {
      id: 'queue-consumer',
      type: 'text',
      text: 'Queue Consumer\nKafka',
      x: 220,
      y: 20,
      width: 180,
      height: 55,
      color: '4',
    },
    {
      id: 'sandbox',
      type: 'text',
      text: 'Sandbox\nFirecracker VMs',
      x: 440,
      y: 20,
      width: 180,
      height: 55,
      color: '5',
      ref: 'canvas:sandbox',
    },

    // Running agents
    {
      id: 'agent-code',
      type: 'text',
      text: 'Code Agent\ntask: refactor',
      x: 0,
      y: 120,
      width: 180,
      height: 55,
      color: '1',
    },
    {
      id: 'agent-research',
      type: 'text',
      text: 'Research Agent\ntask: investigate bug',
      x: 220,
      y: 120,
      width: 180,
      height: 55,
      color: '1',
    },
    {
      id: 'agent-review',
      type: 'text',
      text: 'Review Agent\ntask: PR review',
      x: 440,
      y: 120,
      width: 180,
      height: 55,
      color: '1',
    },
    {
      id: 'agent-docs',
      type: 'text',
      text: 'Docs Agent\ntask: update README',
      x: 0,
      y: 210,
      width: 180,
      height: 55,
      color: '3',
    },
    {
      id: 'agent-test',
      type: 'text',
      text: 'Test Agent\ntask: fix flaky e2e',
      x: 220,
      y: 210,
      width: 180,
      height: 55,
      color: '3',
    },
    {
      id: 'agent-idle',
      type: 'text',
      text: 'Idle Slot\nready',
      x: 440,
      y: 210,
      width: 180,
      height: 55,
      color: '6',
    },
  ],
  edges: [
    {
      id: 'pw-e1',
      fromNode: 'queue-consumer',
      fromSide: 'left',
      toNode: 'supervisor',
      toSide: 'right',
      label: 'tasks',
      animated: true,
    },
    {
      id: 'pw-e2',
      fromNode: 'supervisor',
      fromSide: 'right',
      toNode: 'sandbox',
      toSide: 'left',
      label: 'spawn',
    },
    { id: 'pw-e3', fromNode: 'supervisor', fromSide: 'bottom', toNode: 'agent-code', toSide: 'top' },
    { id: 'pw-e4', fromNode: 'supervisor', fromSide: 'bottom', toNode: 'agent-research', toSide: 'top' },
    { id: 'pw-e5', fromNode: 'supervisor', fromSide: 'bottom', toNode: 'agent-review', toSide: 'top' },
    { id: 'pw-e6', fromNode: 'supervisor', fromSide: 'bottom', toNode: 'agent-docs', toSide: 'top' },
    { id: 'pw-e7', fromNode: 'supervisor', fromSide: 'bottom', toNode: 'agent-test', toSide: 'top' },
    { id: 'pw-e8', fromNode: 'supervisor', toNode: 'supervisor', label: 'retry' },
  ],
}

/**
 * Sub-canvas: Sandbox — the Firecracker microVM internals that host each
 * agent's workspace.
 *
 * Layout: a three-lane timeline on the right, with config files pinned to
 * the left as the "inputs" that the VMM reads. The x-axis within the lanes
 * reads left-to-right as boot order. The blue group wraps the whole thing.
 *
 *   ┌─── Firecracker microVM group ─────────────────────────────────────┐
 *   │                                                                   │
 *   │  [Dockerfile]     Boot:  [VMM] → [Kernel] → [Init]                │
 *   │                                                                   │
 *   │  [vm/config.json] Workspace:  [FS] [Tools] [Runtimes]             │
 *   │                                                                   │
 *   │                   Security:  [seccomp] [vsock] [Metrics]          │
 *   └───────────────────────────────────────────────────────────────────┘
 */
const SANDBOX_ROW = 90

// The lanes start to the right of the files column so the left header
// strip lines up with just the lane content, not the files.
const FILES_X = 0
const LANES_X = 260

export const sandboxCanvas: CanvasData = {
  rows: [
    { id: 'boot',      label: 'Boot',           start: 0,                size: SANDBOX_ROW },
    { id: 'workspace', label: 'Workspace',      start: SANDBOX_ROW,      size: SANDBOX_ROW },
    { id: 'security',  label: 'Security & I/O', start: SANDBOX_ROW * 2,  size: SANDBOX_ROW },
  ],
  nodes: [
    // Blue group wraps everything: files column + lane grid.
    {
      id: 'sb-group',
      type: 'group',
      x: -20,
      y: -20,
      width: 1000,
      height: SANDBOX_ROW * 3 + 40,
      label: 'Firecracker microVM',
      color: '5',
    },

    // --- Files column (left of the lanes) ---
    { id: 'dockerfile', type: 'file', file: 'rootfs/Dockerfile', x: FILES_X, y: 30,  width: 220, height: 40, color: '5' },
    { id: 'vm-config',  type: 'file', file: 'vm/config.json',    x: FILES_X, y: 200, width: 220, height: 40, color: '5' },

    // --- Boot lane (row 0) ---
    { id: 'vmm',    type: 'text', text: 'Firecracker VMM\nhost process', x: LANES_X,       y: 17, width: 200, height: 55, color: '5' },
    { id: 'kernel', type: 'text', text: 'Linux Kernel\n5.10 minimal',    x: LANES_X + 240, y: 17, width: 200, height: 55, color: '2' },
    { id: 'init',   type: 'text', text: 'Init\nguest agent',             x: LANES_X + 480, y: 17, width: 200, height: 55, color: '2' },

    // --- Workspace lane (row 1) ---
    { id: 'workspace-fs',  type: 'text', text: 'Workspace FS\ncloned repo',              x: LANES_X,       y: 107, width: 200, height: 55, color: '4' },
    { id: 'tool-runtime',  type: 'text', text: 'Tool Runtime\nshell + editors',          x: LANES_X + 240, y: 107, width: 200, height: 55, color: '4' },
    { id: 'lang-runtimes', type: 'text', text: 'Language Runtimes\nnode / python / rust', x: LANES_X + 480, y: 107, width: 200, height: 55, color: '4' },

    // --- Security & I/O lane (row 2) ---
    { id: 'seccomp', type: 'text', text: 'seccomp\nsyscall filter', x: LANES_X,       y: 197, width: 200, height: 55, color: '6' },
    { id: 'vsock',   type: 'text', text: 'vsock\nhost bridge',      x: LANES_X + 240, y: 197, width: 200, height: 55, color: '3' },
    { id: 'metrics', type: 'text', text: 'Metrics\ncpu / mem / io', x: LANES_X + 480, y: 197, width: 200, height: 55, color: '3' },
  ],
  edges: [
    { id: 'sb-e1', fromNode: 'vmm', fromSide: 'right', toNode: 'kernel', toSide: 'left', label: 'boots' },
    { id: 'sb-e2', fromNode: 'kernel', fromSide: 'right', toNode: 'init', toSide: 'left' },
    { id: 'sb-e3', fromNode: 'init', fromSide: 'bottom', toNode: 'lang-runtimes', toSide: 'top', label: 'starts' },
    { id: 'sb-e4', fromNode: 'init', fromSide: 'bottom', toNode: 'tool-runtime', toSide: 'top' },
    { id: 'sb-e5', fromNode: 'tool-runtime', fromSide: 'left', toNode: 'workspace-fs', toSide: 'right', label: 'mounts' },
    { id: 'sb-e6', fromNode: 'vmm', fromSide: 'bottom', toNode: 'seccomp', toSide: 'top', label: 'enforces' },
    { id: 'sb-e7', fromNode: 'vmm', fromSide: 'bottom', toNode: 'vsock', toSide: 'top', label: 'io' },
    { id: 'sb-e8', fromNode: 'vmm', fromSide: 'bottom', toNode: 'metrics', toSide: 'top' },
    { id: 'sb-e9', fromNode: 'vmm', fromSide: 'bottom', toNode: 'dockerfile', toSide: 'top', label: 'builds' },
    { id: 'sb-e10', fromNode: 'vmm', fromSide: 'bottom', toNode: 'vm-config', toSide: 'top', label: 'reads' },
  ],
}

/**
 * Map refs to sub-canvases.
 */
export const canvasMap: Record<string, CanvasData> = {
  'canvas:api-gateway': apiGatewayCanvas,
  'canvas:k8s': k8sCanvas,
  'canvas:monitoring': monitoringCanvas,
  'canvas:user-service': userServiceCanvas,
  'canvas:pod-worker': podWorkerCanvas,
  'canvas:sandbox': sandboxCanvas,
}
