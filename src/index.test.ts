import fc from "fast-check";
import V from ".";

const smallIntArb = fc.constantFrom(-2, 0, 3);

describe("variable", () => {
  it("setting a value", () => {
    const a = V.variable(1, { name: "a" });
    fc.assert(
      fc.property(smallIntArb, (data) => {
        V.set(a, data);
        expect(V.get(a)).toBe(data);
      })
    );
  });
});

describe("computed", () => {
  it("one computed with one dependency", () => {
    const a = V.variable(1, { name: "a" });
    const b = V.func(() => V.get(a) + "X", { name: "b" });
    fc.assert(
      fc.property(smallIntArb, (data) => {
        V.set(a, data);
        expect(V.get(b)).toBe(data + "X");
      })
    );
  });

  it("one computed with two dependencies", () => {
    const a = V.variable(1, { name: "a" });
    const b = V.variable(3, { name: "b" });
    const c = V.func(() => V.get(a) * V.get(b), { name: "c" });
    fc.assert(
      fc.property(smallIntArb, smallIntArb, (ai, bi) => {
        V.set(a, ai);
        V.set(b, bi);
        expect(V.get(c)).toBeCloseTo(ai * bi);
      })
    );
  });

  it("two computed with shared dependency", () => {
    const a = V.variable(1, { name: "a" });
    const b = V.func(() => V.get(a) * 2, { name: "b" });
    const c = V.func(() => V.get(a) + 2, { name: "c" });
    fc.assert(
      fc.property(smallIntArb, (n) => {
        V.set(a, n);
        expect(V.get(b)).toBeCloseTo(n * 2);
        expect(V.get(c)).toBeCloseTo(n + 2);
      })
    );
  });

  it("two computed chained, cached value", () => {
    const a = V.variable(1, { eq: (a, b) => a % 2 === b % 2, name: "a" });
    const calc = jest.fn(() => V.get(a) * 2);
    const b = V.func(calc, { name: "b" });
    const c = V.func(() => V.get(b) + 2, { name: "c" });

    // first read
    expect(V.get(c)).toBeCloseTo(1 * 2 + 2);
    expect(calc).toHaveBeenCalledTimes(1);

    // set to equal value (both 1 and 3 are odd numbers)
    V.set(a, 3);

    // second read expects the same result than the first one
    expect(V.get(c)).toBeCloseTo(1 * 2 + 2);

    // Setting value to three shouldn't retrigger a
    // new computation, but use cached value.
    expect(calc).toHaveBeenCalledTimes(1);
  });

  it("four nodes, diamond structure", () => {
    const a = V.variable(1, { name: "a" });
    const b = V.func(() => V.get(a) + 1, { name: "b" });
    const c = V.func(() => V.get(a) + 2, { name: "c" });
    const d = V.func(() => V.get(b) * V.get(c), { name: "d" });

    fc.assert(
      fc.property(smallIntArb, (n) => {
        V.set(a, n);
        expect(V.get(d)).toBeCloseTo((n + 1) * (n + 2));
      })
    );
  });

  it("five nodes, star structure", () => {
    const a = V.variable(1, { name: "a" });
    const b = V.variable(2, { name: "b" });
    const c = V.func(() => V.get(a) * V.get(b), { name: "c" });
    const d = V.func(() => V.get(c) + 1, { name: "d" });
    const e = V.func(() => V.get(c) + 2, { name: "e" });

    fc.assert(
      fc.property(smallIntArb, smallIntArb, (ai, bi) => {
        V.set(a, ai);
        V.set(b, bi);
        expect(V.get(d)).toBeCloseTo(ai * bi + 1);
        expect(V.get(e)).toBeCloseTo(ai * bi + 2);
      })
    );
  });
});

describe("subscriptions", () => {
  it("should notify variable changes", () => {
    const a = V.variable(1, { name: "a" });
    const sub = jest.fn();
    V.subscribe(a, sub);
    V.set(a, 2);
    V.set(a, 1);
    V.set(a, 1);
    expect(sub).toHaveBeenCalledTimes(2);
  });

  it("should notify dependent function", () => {
    const a = V.variable(1, { name: "a" });
    const b = V.variable(1, { name: "b" });
    const c = V.func(() => V.get(a) * V.get(b));
    const sub = jest.fn();
    V.subscribe(c, sub);
    V.set(a, 2);
    V.set(b, 2);
    expect(sub).toHaveBeenCalledTimes(2);
  });
});

describe("dynamic dependencies", () => {
  it("should modify deps dynamically", () => {
    const a = V.variable(2, { name: "a" });
    const b = V.variable(10, { name: "b" });
    const calcC = jest.fn(() => {
      if (V.get(a) > 1) {
        return V.get(b);
      } else {
        return 0;
      }
    });
    const c = V.func(calcC, { name: "c" });
    const sub = jest.fn();

    V.subscribe(c, sub);
    expect(V.get(c)).toBeCloseTo(10);
    expect(calcC).toHaveBeenCalledTimes(1);

    // a is still larger than 1, modifying b
    // should trigger subscription event
    V.set(a, 3);
    expect(V.get(c)).toBeCloseTo(10);
    expect(sub).toHaveBeenCalledTimes(1);
    V.set(b, 20);
    expect(V.get(c)).toBeCloseTo(20);
    expect(sub).toHaveBeenCalledTimes(2);

    // After setting a smaller than two and then
    // modifying b should not trigger subscription event
    V.set(a, 1);
    expect(V.get(c)).toBeCloseTo(0);
    expect(sub).toHaveBeenCalledTimes(3);
    V.set(b, 30);
    expect(V.get(c)).toBeCloseTo(0);
    expect(sub).toHaveBeenCalledTimes(3);
  });

  it("should notify only once even when two dependencies change at the same time", () => {
    const a = V.variable(1, { name: "a" });
    const b = V.func(() => V.get(a) + 1, { name: "b" });
    const c = V.func(() => V.get(a) + 2, { name: "c" });
    const d = V.func(() => V.get(b) * V.get(c), { name: "d" });
    const sub = jest.fn();
    V.subscribe(d, sub);
    V.set(a, 2);
    expect(sub).toHaveBeenCalledTimes(1);
    V.set(a, 3);
    expect(sub).toHaveBeenCalledTimes(2);
  });
});
