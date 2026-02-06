import { Effect } from 'effect';

import { useStore, useStoreAction } from '../../../hooks/useStore';
import { parseBoldText } from '../../../utilities/CommonUtil';
import { Button } from '../Button';
import { Modal } from './Modal';

import type { FC } from 'react';

export const ConfirmModal: FC = () => {
  const confirm = useStore((s) => s.confirm);
  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', id, variant = 'danger', isOpen } = confirm;

  const onCancel = useStoreAction((s) => s.update((prev) => ({ ...prev, confirm: { ...prev.confirm, isOpen: false } })));
  const onConfirm = useStoreAction((s) => (id ? s.executeConfirm(id) : Effect.void));

  return (
    <Modal isOpen={isOpen} onClose={onCancel} containerClassName="confirm-modal-container">
      <div className="confirm-modal-content">
        <div className="modal-header">
          <h3 className="header-title">{title}</h3>
        </div>
        <div className="confirm-modal-message">{parseBoldText(message)}</div>
      </div>

      <div className="confirm-modal-actions">
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button onClick={onConfirm} variant={variant === 'info' ? 'primary' : variant}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
};
