interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface StandaloneNavigator extends Navigator {
  standalone?: boolean;
}

export interface PwaInstallElements {
  button: HTMLButtonElement;
  dialog: HTMLDialogElement;
  help: HTMLElement;
  closeButton: HTMLButtonElement;
}

export function setupPwaInstall({
  button,
  dialog,
  help,
  closeButton,
}: PwaInstallElements): () => void {
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as StandaloneNavigator).standalone === true;

  function hideInstallButton(): void {
    button.hidden = true;
    deferredPrompt = null;
  }

  function showInstallHelp(): void {
    help.textContent = isIos
      ? "共有ボタンを押し、『ホーム画面に追加』→『追加』の順に選んでください。"
      : "ブラウザーのメニューから『アプリをインストール』または『ホーム画面に追加』を選んでください。";
    dialog.showModal();
  }

  function handleBeforeInstallPrompt(event: Event): void {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    button.hidden = false;
  }

  async function handleInstallClick(): Promise<void> {
    if (deferredPrompt === null) {
      showInstallHelp();
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      hideInstallButton();
    } else {
      deferredPrompt = null;
      button.hidden = false;
    }
  }

  function closeDialog(): void {
    dialog.close();
  }

  if (!isStandalone && isIos) {
    button.hidden = false;
  }

  if (isStandalone) {
    hideInstallButton();
  }

  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", hideInstallButton);
  button.addEventListener("click", handleInstallClick);
  closeButton.addEventListener("click", closeDialog);

  return () => {
    window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.removeEventListener("appinstalled", hideInstallButton);
    button.removeEventListener("click", handleInstallClick);
    closeButton.removeEventListener("click", closeDialog);
  };
}
