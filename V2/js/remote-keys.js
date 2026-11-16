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
        // Só considera input ativo se o modal de configurações estiver visível
        var modal = document.getElementById('settings-modal');
        var isModalVisible = modal && modal.style.display !== 'none';
        if (!isModalVisible) return false;

        var active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    }

    bindEvents() {
        var self = this;

        // Previne o comportamento padrão de fechar o app no keyup do botão voltar do webOS
        window.addEventListener('keyup', function(e) {
            var keyCode = e.keyCode || e.which;
            if (keyCode === 461 || e.key === 'Back' || e.key === 'GoBack') {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        window.addEventListener('keydown', function(e) {
            var keyCode = e.keyCode || e.which;
            var keyName = e.key;
            var inputActive = self.isInputActive();

            // Quando o usuário está digitando dentro de um input no modal
            if (inputActive) {
                // Tecla Back / Esc: cancela/fecha input ou fecha modal
                if (keyCode === 461 || keyCode === 27 || keyCode === 10009 || keyName === 'Escape' || keyName === 'Back') {
                    document.activeElement.blur();
                    if (self.callbacks.onBack) self.callbacks.onBack();
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                // Enter no input
                if (keyCode === 13 || keyName === 'Enter') {
                    if (self.callbacks.onEnter) self.callbacks.onEnter();
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                // Seta Cima / Baixo: navega entre os campos
                if (keyCode === 38 || keyName === 'ArrowUp') {
                    if (self.callbacks.onUp) self.callbacks.onUp();
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (keyCode === 40 || keyName === 'ArrowDown') {
                    if (self.callbacks.onDown) self.callbacks.onDown();
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                // Deixa digitar texto, números e apagar com backspace dentro do input
                return;
            }

            // Tecla Voltar (Back no LG webOS, Return no Samsung, Esc ou Backspace no PC)
            if (keyCode === 461 || keyCode === 10009 || keyCode === 27 || keyCode === 8 || keyName === 'Back' || keyName === 'GoBack' || keyName === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onBack) self.callbacks.onBack();
                return;
            }

            // Setas Direcionais (▲ ▼ ◄ ►)
            if (keyCode === 38 || keyName === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onUp) self.callbacks.onUp();
                return;
            }
            if (keyCode === 40 || keyName === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onDown) self.callbacks.onDown();
                return;
            }
            if (keyCode === 37 || keyName === 'ArrowLeft') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onLeft) self.callbacks.onLeft();
                return;
            }
            if (keyCode === 39 || keyName === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onRight) self.callbacks.onRight();
                return;
            }

            // OK / Enter
            if (keyCode === 13 || keyName === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onEnter) self.callbacks.onEnter();
                return;
            }

            // Teclas Numéricas (0-9) - Tanto teclado numérico padrão quanto numpad e e.key
            var digit = -1;
            if (keyCode >= 48 && keyCode <= 57) {
                digit = keyCode - 48;
            } else if (keyCode >= 96 && keyCode <= 105) {
                digit = keyCode - 96;
            } else if (typeof keyName === 'string' && keyName.length === 1 && keyName >= '0' && keyName <= '9') {
                digit = parseInt(keyName, 10);
            }

            if (digit >= 0 && digit <= 9) {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onNumber) self.callbacks.onNumber(digit);
                return;
            }

            // Teclas Coloridas
            // Vermelho (Red / R)
            if (keyCode === 403 || keyCode === 82 || keyName === 'r' || keyName === 'R' || keyName === 'Red') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onRed) self.callbacks.onRed();
                return;
            }
            // Verde (Green / G)
            if (keyCode === 404 || keyCode === 71 || keyName === 'g' || keyName === 'G' || keyName === 'Green') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onGreen) self.callbacks.onGreen();
                return;
            }
            // Amarelo (Yellow / Y)
            if (keyCode === 405 || keyCode === 89 || keyName === 'y' || keyName === 'Y' || keyName === 'Yellow') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onYellow) self.callbacks.onYellow();
                return;
            }
            // Azul (Blue / B)
            if (keyCode === 406 || keyCode === 66 || keyName === 'b' || keyName === 'B' || keyName === 'Blue') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onBlue) self.callbacks.onBlue();
                return;
            }

            // Canal Cima / Baixo (CH+ / CH- ou PageUp / PageDown)
            if (keyCode === 427 || keyCode === 33 || keyName === 'ChannelUp' || keyName === 'PageUp') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onChannelUp) self.callbacks.onChannelUp();
                return;
            }
            if (keyCode === 428 || keyCode === 34 || keyName === 'ChannelDown' || keyName === 'PageDown') {
                e.preventDefault();
                e.stopPropagation();
                if (self.callbacks.onChannelDown) self.callbacks.onChannelDown();
                return;
            }
        }, true);
    }
}

window.RemoteControlManager = RemoteControlManager;
