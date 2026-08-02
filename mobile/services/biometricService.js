import * as LocalAuthentication from 'expo-local-authentication';

export async function isBiometricAvailable() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch (e) {
    return false;
  }
}

export async function authenticateBiometric(promptMessage = 'Unlock Personal NAS') {
  try {
    const available = await isBiometricAvailable();
    if (!available) {
      return { success: true, bypassed: true };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use System Passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
}
