type LocationLike = {
  protocol: string;
  hostname: string;
};

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isSecurePasswordSubmissionContext(
  locationLike?: LocationLike | null,
) {
  const currentLocation = locationLike ?? getBrowserLocation();

  if (!currentLocation) {
    return true;
  }

  if (currentLocation.protocol === "https:") {
    return true;
  }

  return isLoopbackHost(currentLocation.hostname);
}

export function getInsecurePasswordSubmissionMessage(
  locationLike?: LocationLike | null,
) {
  if (isSecurePasswordSubmissionContext(locationLike)) {
    return null;
  }

  return "Password actions are disabled on insecure HTTP connections. Open the app over HTTPS before signing in or setting a password.";
}

function getBrowserLocation() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location;
}

function isLoopbackHost(hostname: string) {
  return loopbackHosts.has(hostname) || hostname.endsWith(".localhost");
}
