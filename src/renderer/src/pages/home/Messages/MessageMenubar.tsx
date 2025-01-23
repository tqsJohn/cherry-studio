import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  ForkOutlined,
  LikeFilled,
  LikeOutlined,
  MenuOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  SyncOutlined,
  TranslationOutlined
} from '@ant-design/icons'
import SelectModelPopup from '@renderer/components/Popups/SelectModelPopup'
import TextEditPopup from '@renderer/components/Popups/TextEditPopup'
import { TranslateLanguageOptions } from '@renderer/config/translate'
import { modelGenerating } from '@renderer/hooks/useRuntime'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { translateText } from '@renderer/services/TranslateService'
import { Message, Model } from '@renderer/types'
import { removeTrailingDoubleSpaces, uuid } from '@renderer/utils'
import { Button, Dropdown, Popconfirm, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { FC, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface Props {
  message: Message
  assistantModel?: Model
  model?: Model
  index?: number
  isGrouped?: boolean
  isLastMessage: boolean
  isAssistantMessage: boolean
  setModel: (model: Model) => void
  onEditMessage?: (message: Message) => void
  onDeleteMessage?: (message: Message) => Promise<void>
  onGetMessages?: () => Message[]
}

const MessageMenubar: FC<Props> = (props) => {
  const {
    message,
    index,
    isGrouped,
    model,
    isLastMessage,
    isAssistantMessage,
    assistantModel,
    onEditMessage,
    onDeleteMessage,
    onGetMessages
  } = props
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)

  const isUserMessage = message.role === 'user'

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(removeTrailingDoubleSpaces(message.content))
    window.message.success({ content: t('message.copied'), key: 'copy-message' })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content, t])

  const onNewBranch = useCallback(async () => {
    await modelGenerating()
    EventEmitter.emit(EVENT_NAMES.NEW_BRANCH, index)
    window.message.success({
      content: t('chat.message.new.branch.created'),
      key: 'new-branch'
    })
  }, [index, t])

  const onResend = useCallback(async () => {
    await modelGenerating()
    const _messages = onGetMessages?.() || []
    const index = _messages.findIndex((m) => m.id === message.id)
    const nextIndex = index + 1
    const nextMessage = _messages[nextIndex]

    if (nextMessage && nextMessage.role === 'assistant') {
      EventEmitter.emit(EVENT_NAMES.RESEND_MESSAGE + ':' + nextMessage.id, {
        ...nextMessage,
        content: '',
        status: 'sending',
        model: assistantModel || model,
        translatedContent: undefined
      })
    }

    if (!nextMessage || nextMessage.role === 'user') {
      EventEmitter.emit(EVENT_NAMES.SEND_MESSAGE, { ...message, id: uuid() })
      onDeleteMessage?.(message)
    }
  }, [assistantModel, message, model, onDeleteMessage, onGetMessages])

  const onEdit = useCallback(async () => {
    let resendMessage = false

    const editedText = await TextEditPopup.show({
      text: message.content,
      children: (props) =>
        message.role === 'user' ? (
          <ReSendButton
            icon={<i className="iconfont icon-ic_send" style={{ color: 'var(--color-primary)' }} />}
            onClick={() => {
              props.onOk?.()
              resendMessage = true
            }}>
            {t('chat.resend')}
          </ReSendButton>
        ) : null
    })

    editedText && onEditMessage?.({ ...message, content: editedText })
    resendMessage && onResend()
  }, [message, onEditMessage, onResend, t])

  const handleTranslate = useCallback(
    async (language: string) => {
      if (isTranslating) return

      onEditMessage?.({ ...message, translatedContent: t('translate.processing') })

      setIsTranslating(true)

      try {
        await translateText(message.content, language, (text) =>
          onEditMessage?.({ ...message, translatedContent: text })
        )
      } catch (error) {
        console.error('Translation failed:', error)
        window.message.error({
          content: t('translate.error.failed'),
          key: 'translate-message'
        })
        onEditMessage?.({ ...message, translatedContent: undefined })
      } finally {
        setIsTranslating(false)
      }
    },
    [isTranslating, message, onEditMessage, t]
  )

  const dropdownItems = useMemo(
    () => [
      {
        label: t('chat.save'),
        key: 'save',
        icon: <SaveOutlined />,
        onClick: () => {
          const fileName = dayjs(message.createdAt).format('YYYYMMDDHHmm') + '.md'
          window.api.file.save(fileName, message.content)
        }
      },
      {
        label: t('common.edit'),
        key: 'edit',
        icon: <EditOutlined />,
        onClick: onEdit
      },
      {
        label: t('chat.message.new.branch'),
        key: 'new-branch',
        icon: <ForkOutlined />,
        onClick: onNewBranch
      }
    ],
    [message, onEdit, onNewBranch, t]
  )

  const onRegenerate = async () => {
    await modelGenerating()
    const selectedModel = await SelectModelPopup.show({ model })
    if (!selectedModel) return

    const _message: Message = {
      ...message,
      content: '',
      reasoning_content: undefined,
      metrics: undefined,
      status: 'sending',
      model: selectedModel,
      translatedContent: undefined,
      metadata: undefined
    }

    if (message.askId && message.model) {
      return EventEmitter.emit(EVENT_NAMES.APPEND_MESSAGE, { ..._message, id: uuid() })
    }

    onEditMessage?.(_message)
  }

  const onUseful = useCallback(() => {
    onEditMessage?.({ ...message, useful: !message.useful })
  }, [message, onEditMessage])

  return (
    <MenusBar className={`menubar ${isLastMessage && 'show'}`}>
      {message.role === 'user' && (
        <Tooltip title={t('common.edit')} mouseEnterDelay={0.8}>
          <ActionButton className="message-action-button" onClick={onEdit}>
            <EditOutlined />
          </ActionButton>
        </Tooltip>
      )}
      <Tooltip title={t('common.copy')} mouseEnterDelay={0.8}>
        <ActionButton className="message-action-button" onClick={onCopy}>
          {!copied && <i className="iconfont icon-copy"></i>}
          {copied && <CheckOutlined style={{ color: 'var(--color-primary)' }} />}
        </ActionButton>
      </Tooltip>
      {isAssistantMessage && (
        <Tooltip title={t('common.regenerate')} mouseEnterDelay={0.8}>
          <ActionButton className="message-action-button" onClick={onRegenerate}>
            <SyncOutlined />
          </ActionButton>
        </Tooltip>
      )}
      {!isUserMessage && (
        <Dropdown
          menu={{
            items: [
              ...TranslateLanguageOptions.map((item) => ({
                label: item.emoji + ' ' + item.label,
                key: item.value,
                onClick: () => handleTranslate(item.value)
              })),
              {
                label: '✖ ' + t('translate.close'),
                key: 'translate-close',
                onClick: () => onEditMessage?.({ ...message, translatedContent: undefined })
              }
            ]
          }}
          trigger={['click']}
          placement="topRight"
          arrow>
          <Tooltip title={t('chat.translate')} mouseEnterDelay={1.2}>
            <ActionButton className="message-action-button">
              <TranslationOutlined />
            </ActionButton>
          </Tooltip>
        </Dropdown>
      )}
      {isAssistantMessage && (
        <Tooltip title={t('chat.message.useful')} mouseEnterDelay={0.8}>
          <ActionButton className="message-action-button" onClick={onUseful}>
            {message.useful ? <LikeFilled /> : <LikeOutlined />}
          </ActionButton>
        </Tooltip>
      )}
      <Popconfirm
        disabled={isGrouped}
        title={t('message.message.delete.content')}
        okButtonProps={{ danger: true }}
        icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
        onConfirm={() => onDeleteMessage?.(message)}>
        <Tooltip title={t('common.delete')} mouseEnterDelay={1}>
          <ActionButton
            className="message-action-button"
            onClick={isGrouped ? () => onDeleteMessage?.(message) : undefined}>
            <DeleteOutlined />
          </ActionButton>
        </Tooltip>
      </Popconfirm>
      {!isUserMessage && (
        <Dropdown menu={{ items: dropdownItems }} trigger={['click']} placement="topRight" arrow>
          <ActionButton className="message-action-button">
            <MenuOutlined />
          </ActionButton>
        </Dropdown>
      )}
    </MenusBar>
  )
}

const MenusBar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  margin-left: -5px;
`

const ActionButton = styled.div`
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  width: 30px;
  height: 30px;
  transition: all 0.2s ease;
  &:hover {
    background-color: var(--color-background-mute);
    .anticon {
      color: var(--color-text-1);
    }
  }
  .anticon,
  .iconfont {
    cursor: pointer;
    font-size: 14px;
    color: var(--color-icon);
  }
  &:hover {
    color: var(--color-text-1);
  }
  .icon-at {
    font-size: 16px;
  }
`

const ReSendButton = styled(Button)`
  position: absolute;
  top: 10px;
  left: 0;
`

export default MessageMenubar
