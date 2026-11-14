/**
 * Gerenciador de Controle Remoto para LG webOS Smart TV, Samsung Tizen e Teclado PC
 */
class RemoteControlManager {
    constructor(appCallbacks) {
        this.callbacks = appCallbacks || {};
        this.registerPlatformKeys();
        this.bindEvents();
    }

    registerPlatformKeys() {
        // Compatibilidade Samsung Tizen (caso execute em ambiente Tizen)
        if (typeof window.tizen !== 'undefined' && typeof window.tizen.tvinputdevice !== 'undefined') {
            var keysToRegister = [
                'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
                'ChannelUp', 'ChannelDown', 'MediaPlay', 'MediaPause', 'MediaStop',
                '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
            ];

            keysToRegister.forEach(function(keyName) {
                try {
                    window.tizen.tvinputdevice.registerKey(keyName);
                } catch (e) {
                    // ignorar
                }
            });
        }
    }

    isInputActive() {
        var active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    }

    bindEvents() {
        var self = this;
        window.addEventListener('keydown', function(e) {
            var keyCode = e.keyCode;
            var inputActive = self.isInputActive();

            // Quando o usuário está digitando em um campo de texto (ex: IP, senha, portas)
            if (inputActive) {
                // Tecla Back / Esc: tira o foco do input ou fecha modal
                if (keyCode === 461 || keyCode === 27 || keyCode === 10009) {
                    document.activeElement.blur();
                    if (self.callbacks.onBack) self.callbacks.onBack();
                    e.preventDefault();
                    return;
                }

                // Enter no input: pode acionar Enter
                if (keyCode === 13) {
                    if (self.callbacks.onEnter) self.callbacks.onEnter();
                    e.preventDefault();
                    return;
                }

                // Seta Cima / Baixo: permite navegar para o próximo/anterior campo
                if (keyCode === 38) {
                    if (self.callbacks.onUp) self.callbacks.onUp();
                    e.preventDefault();
                    return;
                }
                if (keyCode === 40) {
                    if (self.callbacks.onDown) self.callbacks.onDown();
                    e.preventDefault();
                    return;
                }

                // Para qualquer outra tecla (letras, números 0-9, backspace, setas esquerda/direita),
                // deixa o navegador/teclado nativo da TV processar normalmente!
                return;
            }

            // Navegação e atalhos normais fora de campos de input
            switch (keyCode) {
                case 38: // Seta Cima
                    if (self.callbacks.onUp) self.callbacks.onUp();
                    e.preventDefault();
                    break;
                case 40: // Seta Baixo
                    if (self.callbacks.onDown) self.callbacks.onDown();
                    e.preventDefault();
                    break;
                case 37: // Seta Esquerda
                    if (self.callbacks.onLeft) self.callbacks.onLeft();
                    e.preventDefault();
                    break;
                case 39: // Seta Direita
                    if (self.callbacks.onRight) self.callbacks.onRight();
                    e.preventDefault();
                    break;

                case 13: // Enter / OK
                    if (self.callbacks.onEnter) self.callbacks.onEnter();
                    e.preventDefault();
                    break;

                case 461:   // Botão Voltar (LG webOS TV Remote)
                case 10009: // Botão Return (Samsung Tizen)
                case 8:     // Backspace (PC)
                case 27:    // Esc (PC)
                    if (self.callbacks.onBack) self.callbacks.onBack();
                    e.preventDefault();
                    break;

                // Tecla Vermelha / R no PC
                case 403:
                case 82:
                    if (self.callbacks.onRed) self.callbacks.onRed();
                    e.preventDefault();
                    break;

                // Tecla Verde / G no PC
                case 404:
                case 71:
                    if (self.callbacks.onGreen) self.callbacks.onGreen();
                    e.preventDefault();
                    break;

                // Tecla Amarela / Y no PC
                case 405:
                case 89:
                    if (self.callbacks.onYellow) self.callbacks.onYellow();
                    e.preventDefault();
                    break;

                // Tecla Azul / B no PC
                case 406:
                case 66:
                    if (self.callbacks.onBlue) self.callbacks.onBlue();
                    e.preventDefault();
                    break;

                case 427: // Channel Up / Page Up
                case 33:
                    if (self.callbacks.onChannelUp) self.callbacks.onChannelUp();
                    e.preventDefault();
                    break;
                case 428: // Channel Down / Page Down
                case 34:
                    if (self.callbacks.onChannelDown) self.callbacks.onChannelDown();
                    e.preventDefault();
                    break;

                default:
                    // Números 0-9
                    if (keyCode >= 48 && keyCode <= 57) {
                        var num = keyCode - 48;
                        if (self.callbacks.onNumber) self.callbacks.onNumber(num);
                    }
                    break;
            }
        });
    }
}

window.RemoteControlManager = RemoteControlManager;
