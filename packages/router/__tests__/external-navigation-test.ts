import { createMemoryHistory, createRouter, redirect } from "../index";
import { validateNavigationTarget } from "../navigation";
import { cleanup, setup } from "./utils/data-router-setup";

const EXPLICIT_EXTERNAL_URLS = [
  "http://example.com/path",
  "https://example.com/path",
  "//example.com/path",
  "mailto:test@example.com",
  "tel:5551234567",
];

const IMPLICIT_EXTERNAL_URLS = [
  "/\t/example.com/path",
  "/\\example.com/path",
  "\\/example.com/path",
  "\\\\example.com/path",
];

const INVALID_PROTOCOL_URLS = [
  // eslint-disable-next-line no-script-url
  "javascript:console.log('hi')",
  "data:foo",
];

const EXTERNAL_URLS = [
  ...EXPLICIT_EXTERNAL_URLS,
  ...IMPLICIT_EXTERNAL_URLS,
  ...INVALID_PROTOCOL_URLS,
];

const VALID_INTERNAL_URLS = [
  {
    original: "\\example.com/path",
    resolved: "/example.com/path",
  },
];

function createTestWindow() {
  return {
    ...window,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    location: {
      ...window.location,
      assign: jest.fn(),
      replace: jest.fn(),
    },
  } as unknown as Window;
}

function createRedirectRouter(location: string, testWindow: Window) {
  let history = createMemoryHistory();
  jest.spyOn(history, "push");
  let router = createRouter({
    history,
    routes: [
      { path: "/" },
      {
        path: "/start",
        loader: () => redirect(location),
      },
    ],
    window: testWindow,
  }).initialize();
  return { history, router };
}

describe("external navigation support", () => {
  afterEach(() => cleanup());

  it.each(EXTERNAL_URLS)(
    "router.navigate throws for external navigation to %s",
    async (to) => {
      let t = setup({
        routes: [{ id: "index", index: true }],
      });

      await expect(t.router.navigate(to)).rejects.toThrow(
        "External navigation is not allowed"
      );
      expect(t.router.state.location.pathname).toBe("/");
      expect(t.history.push).not.toHaveBeenCalled();
    }
  );

  it.each(VALID_INTERNAL_URLS)(
    "router.navigate does not throw for an internal navigation to %s",
    async (to) => {
      let t = setup({
        routes: [{ id: "index", index: true }],
      });

      await t.router.navigate(to.original);
      expect(t.router.state.location.pathname).toBe(to.resolved);
      expect(t.history.push).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: to.resolved }),
        null
      );
    }
  );

  it.each(IMPLICIT_EXTERNAL_URLS)(
    "client-side redirect rejects implicit external redirects to %s",
    async (location) => {
      let testWindow = createTestWindow();
      let { router } = createRedirectRouter(location, testWindow);

      await expect(router.navigate("/start")).rejects.toThrow(
        "External navigation is not allowed"
      );
      expect(testWindow.location.assign).not.toHaveBeenCalled();
      router.dispose();
    }
  );

  it.each(INVALID_PROTOCOL_URLS)(
    "client-side redirect rejects invalid protocol redirects to %s",
    async (location) => {
      let testWindow = createTestWindow();
      let { router } = createRedirectRouter(location, testWindow);

      await expect(router.navigate("/start")).rejects.toThrow(
        "Invalid redirect location"
      );
      expect(testWindow.location.assign).not.toHaveBeenCalled();
      router.dispose();
    }
  );

  it.each(EXPLICIT_EXTERNAL_URLS)(
    "client-side redirects permit explicit external redirects to %s",
    async (location) => {
      let testWindow = createTestWindow();
      let { router } = createRedirectRouter(location, testWindow);

      await router.navigate("/start");
      expect(testWindow.location.assign).toHaveBeenCalledWith(location);
      router.dispose();
    }
  );

  it.each(VALID_INTERNAL_URLS)(
    "client-side redirects permit valid internal redirects to %s",
    async (to) => {
      let testWindow = createTestWindow();
      let { history, router } = createRedirectRouter(to.original, testWindow);

      await router.navigate("/start");
      expect(history.push).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: to.resolved }),
        expect.any(Object)
      );
      expect(testWindow.location.assign).not.toHaveBeenCalled();
      router.dispose();
    }
  );

  it("rejects an invalid resolved destination", () => {
    expect(() =>
      validateNavigationTarget(
        "/internal",
        "http://[",
        new URL("https://app.example/"),
        "reject"
      )
    ).toThrow();
  });

  it("rejects an explicit destination whose origin changed", () => {
    expect(() =>
      validateNavigationTarget(
        "https://first.example/path",
        "https://second.example/path",
        new URL("https://app.example/"),
        "allow-explicit"
      )
    ).toThrow("External navigation is not allowed");
  });
});
