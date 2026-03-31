import { Alert, Platform } from 'react-native';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface WebAlertRequest {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

type WebAlertPresenter = (req: WebAlertRequest) => void;

let webAlertPresenter: WebAlertPresenter | null = null;

/**
 * Register an in-app presenter for web alerts.
 * Used to avoid relying on window.confirm/alert, which can be blocked or flaky in embedded webviews.
 */
export const registerWebAlertPresenter = (presenter: WebAlertPresenter | null) => {
  webAlertPresenter = presenter;
};

/**
 * Cross-platform alert that works on iOS, Android, AND Web
 * On mobile: uses native Alert.alert
 * On web: prefers an in-app modal presenter; falls back to window.confirm/alert
 */
export const showAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[]
): void => {
  if (Platform.OS === 'web') {
    // Prefer in-app modal presenter when available (more reliable than window.confirm).
    if (webAlertPresenter) {
      webAlertPresenter({ title, message, buttons });
      return;
    }

    // Web implementation
    if (!buttons || buttons.length === 0) {
      // Simple info alert
      window.alert(`${title}${message ? '\n\n' + message : ''}`);
      return;
    }

    if (buttons.length === 1) {
      // Single button - just show alert and call callback
      window.alert(`${title}${message ? '\n\n' + message : ''}`);
      buttons[0].onPress?.();
      return;
    }

    // Multiple buttons - use confirm dialog
    // Find the "destructive" or primary action button (usually the one that's not "Cancel")
    const cancelButton = buttons.find(b => b.style === 'cancel' || b.text.toLowerCase() === 'cancel');
    const actionButton = buttons.find(b => b !== cancelButton);

    const confirmed = window.confirm(`${title}${message ? '\n\n' + message : ''}`);
    
    if (confirmed && actionButton) {
      actionButton.onPress?.();
    } else if (!confirmed && cancelButton) {
      cancelButton.onPress?.();
    }
  } else {
    // Native implementation (iOS/Android)
    Alert.alert(title, message, buttons);
  }
};

export default showAlert;














