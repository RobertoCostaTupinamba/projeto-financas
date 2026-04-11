import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Delay the fetch so we can observe the isLoading=true state before it settles
function makePendingFetch() {
  return new Promise<Response>(() => {
    // never resolves during the synchronous render
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => makePendingFetch()));
});

function LoadingProbe() {
  const { isLoading } = useAuth();
  return <div data-testid="loading">{isLoading ? "loading" : "done"}</div>;
}

describe("AuthContext", () => {
  it("isLoading is true before the refresh fetch resolves", () => {
    render(
      <AuthProvider>
        <LoadingProbe />
      </AuthProvider>
    );
    expect(screen.getByTestId("loading").textContent).toBe("loading");
  });

  it("useAuth throws when used outside AuthProvider", () => {
    function Bad() {
      useAuth();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(
      "useAuth must be used inside <AuthProvider>"
    );
  });
});
