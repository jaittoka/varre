type Eq<T> = (a: T, b: T) => boolean;

type BaseNode<T> = {
  id: number;
  name?: string;
  subscriptions: (() => void)[];
  eq: Eq<T>;
};

type VariableNode<T> = {
  type: "variable";
  value: T;
} & BaseNode<T>;

type FunctionNode<T> = {
  type: "function";
  calculate: () => T;
  dirty: boolean;
  value?: T;
} & BaseNode<T>;

export type Node<T> = VariableNode<T> | FunctionNode<T>;

export interface Opts<T> {
  eq?: Eq<T>;
  name?: string;
}

export type System = {
  variable: <T>(initialValue: T, opts?: Opts<T>) => VariableNode<T>;
  func: <S>(f: () => S, opts?: Opts<S>) => FunctionNode<S>;
  get: <T>(n: Node<T>) => T;
  set: <T>(n: VariableNode<T>, v: T) => void;
  update: <T>(n: VariableNode<T>, f: (prev: T) => T) => void;
  subscribe: <T>(n: Node<T>, f: () => void) => () => void;
};

const defaultEq = <T>(a: T, b: T): boolean => a === b;

interface Dep {
  from: FunctionNode<any>;
  to: Node<any>;
}

export function system(): System {
  let runningId = 1;
  let deps: Dep[] = [];
  let stack: FunctionNode<any>[] = [];

  function clearDependenciesFrom(n: FunctionNode<any>) {
    deps = deps.filter((dep) => dep.from !== n);
  }

  function findDepsTo(n: Node<any>): FunctionNode<any>[] {
    const result: FunctionNode<any>[] = [];
    deps.forEach((dep) => {
      if (dep.to === n) {
        result.push(dep.from);
      }
    });
    return result;
  }

  function addDependency(from: FunctionNode<any>, to: Node<any>) {
    deps.push({ from, to });
  }

  function trackGet(to: Node<any>) {
    if (stack.length > 0) {
      const from = stack[stack.length - 1];
      addDependency(from, to);
    }
  }

  function notifySubscribers(n: Node<any>) {
    n.subscriptions.forEach((s) => s());
  }

  function setDependeesDirty<T>(startNode: Node<T>) {
    const seenNodes: Map<number, boolean> = new Map();
    const dirtyNodes: Node<any>[] = [];

    function mark<S>(node: Node<S>) {
      if (seenNodes.get(node.id) === true) return;
      seenNodes.set(node.id, true);
      dirtyNodes.push(node);
      findDepsTo(node).forEach((from) => {
        from.dirty = true;
        mark(from);
      });
    }
    mark(startNode);
    dirtyNodes.forEach(notifySubscribers);
  }

  function enterFunctionNode(n: FunctionNode<any>) {
    clearDependenciesFrom(n);
    stack.push(n);
  }

  function leaveFunctionNode(n: FunctionNode<any>) {
    stack.pop();
  }

  function get<T>(n: Node<T>): T {
    trackGet(n);

    if (n.type === "variable") {
      return n.value;
    }

    if (n.value === undefined || n.dirty) {
      enterFunctionNode(n);
      const value = n.calculate();
      leaveFunctionNode(n);
      n.dirty = false;
      if (n.value === undefined || !n.eq(n.value, value)) {
        n.value = value;
      }
    }

    return n.value;
  }

  function set<T>(n: VariableNode<T>, value: T): void {
    if (n.eq(n.value, value)) return;
    n.value = value;
    setDependeesDirty(n);
  }

  function update<T>(n: VariableNode<T>, f: (prev: T) => T): void {
    set(n, f(get(n)));
  }

  function subscribe<T>(n: Node<T>, f: () => void): () => void {
    n.subscriptions = n.subscriptions.concat(f);
    return () => {
      n.subscriptions = n.subscriptions.filter((s) => s !== f);
    };
  }

  function variable<T>(initialValue: T, opts: Opts<T> = {}): VariableNode<T> {
    return {
      type: "variable",
      id: runningId++,
      subscriptions: [],
      value: initialValue,
      eq: opts.eq || defaultEq,
      name: opts.name,
    };
  }

  function func<S>(calculate: () => S, opts: Opts<S> = {}): FunctionNode<S> {
    const result: FunctionNode<S> = {
      type: "function",
      id: runningId++,
      subscriptions: [],
      calculate,
      dirty: true,
      value: undefined,
      eq: opts.eq || defaultEq,
      name: opts.name,
    };
    // Initialize deps by calling get()
    get(result);
    return result;
  }

  return { get, set, update, subscribe, variable, func };
}

export default system();
