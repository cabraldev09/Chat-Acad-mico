const messages = {
  pt: {
    translations: {
      signup: {
        title: "Criar conta",
        toasts: {
          success: "Usuário criado com sucesso! Faça seu login!!!.",
          fail: "Erro ao criar usuário. Verifique os dados informados.",
        },
        form: {
          name: "Nome",
          email: "Email",
          password: "Senha",
        },
        buttons: {
          submit: "Cadastrar",
          login: "Já tem uma conta? Entre!",
        },
      },
      login: {
        title: "Login",
        form: {
          email: "Email",
          password: "Senha",
        },
        buttons: {
          submit: "Entrar",
          register: "Ainda não tem conta? Cadastre-se",
        },
      },
      auth: {
        toasts: {
          success: "Login efetuado com sucesso!",
        },
      },
      dashboard: {
        charts: {
          perDay: {
            title: "Tickets hoje: ",
          },
        },
        messages: {
          inAttendance: {
            title: "Em Atendimento"
          },
          waiting: {
            title: "Aguardando"
          },
          closed: {
            title: "Finalizado"
          }
        }
      },
      connections: {
        title: "Conexões",
        toasts: {
          deleted: "Conexão com o WhatsApp excluída com sucesso!",
        },
        confirmationModal: {
          deleteTitle: "Deletar",
          deleteMessage: "Você tem certeza? Essa ação não pode ser revertida.",
          disconnectTitle: "Desconectar",
          disconnectMessage:
            "Tem certeza? Você precisará ler o QR Code novamente.",
        },
        buttons: {
          add: "Adicionar conexão",
          disconnect: "desconectar",
          tryAgain: "Tentar novamente",
          qrcode: "QR CODE",
          newQr: "Novo QR CODE",
          connecting: "Conectando",
        },
        toolTips: {
          disconnected: {
            title: "Falha ao iniciar sessão do WhatsApp",
            content:
              "Certifique-se de que seu celular esteja conectado à internet e tente novamente, ou solicite um novo QR Code",
          },
          qrcode: {
            title: "Esperando leitura do QR Code",
            content:
              "Clique no botão 'QR CODE' e leia o QR Code com o seu celular para iniciar a sessão",
          },
          connected: {
            title: "Conexão estabelecida!",
          },
          timeout: {
            title: "A conexão com o celular foi perdida",
            content:
              "Certifique-se de que seu celular esteja conectado à internet e o WhatsApp esteja aberto, ou clique no botão 'Desconectar' para obter um novo QR Code",
          },
        },
        table: {
          name: "Nome",
          status: "Status",
          lastUpdate: "Última atualização",
          default: "Padrão",
          actions: "Ações",
          session: "Sessão",
        },
      },
      whatsappModal: {
        title: {
          add: "Adicionar conexão",
          edit: "Editar WhatsApp",
        },
        form: {
          name: "Nome",
          default: "Padrão",
          farewellMessage: "Mensagem de despedida"
        },
        buttons: {
          okAdd: "Adicionar",
          okEdit: "Salvar",
          cancel: "Cancelar",
        },
        success: "WhatsApp salvo com sucesso.",
      },
      qrCode: {
        message: "Leia o QrCode para iniciar a sessão",
      },
      contacts: {
        title: "Contatos",
        toasts: {
          deleted: "Contato excluído com sucesso!",
        },
        searchPlaceholder: "Pesquisar...",
        confirmationModal: {
          deleteTitle: "Deletar ",
          importTitlte: "Importar contatos",
          deleteMessage:
            "Tem certeza que deseja deletar este contato? Todos os tickets relacionados serão perdidos.",
          importMessage: "Importar os contatos salvos na agenda do número conectado? Quem já está aqui não é duplicado, e os nomes que eram só números são completados.",
        },
        buttons: {
          import: "Importar Contatos",
          add: "Adicionar Contato",
        },
        table: {
          name: "Nome",
          whatsapp: "WhatsApp",
          email: "Email",
          actions: "Ações",
        },
      },
      contactModal: {
        title: {
          add: "Adicionar contato",
          edit: "Editar contato",
        },
        form: {
          mainInfo: "Dados do contato",
          extraInfo: "Informações adicionais",
          name: "Nome",
          number: "Número do Whatsapp",
          email: "Email",
          extraName: "Nome do campo",
          extraValue: "Valor",
        },
        buttons: {
          addExtraInfo: "Adicionar informação",
          okAdd: "Adicionar",
          okEdit: "Salvar",
          cancel: "Cancelar",
        },
        success: "Contato salvo com sucesso.",
      },
      quickAnswersModal: {
        title: {
          add: "Adicionar Resposta Rápida",
          edit: "Editar Resposta Rápida",
        },
        form: {
          shortcut: "Atalho",
          message: "Resposta Rápida",
        },
        buttons: {
          okAdd: "Adicionar",
          okEdit: "Salvar",
          cancel: "Cancelar",
        },
        success: "Resposta Rápida salva com sucesso.",
      },
      queueModal: {
        title: {
          add: "Adicionar fila",
          edit: "Editar fila",
        },
        form: {
          name: "Nome",
          color: "Cor",
          greetingMessage: "Mensagem de saudação",
        },
        buttons: {
          okAdd: "Adicionar",
          okEdit: "Salvar",
          cancel: "Cancelar",
        },
      },
      userModal: {
        title: {
          add: "Adicionar usuário",
          edit: "Editar usuário",
        },
        form: {
          name: "Nome",
          email: "Email",
          password: "Senha",
          profile: "Função",
          whatsapp: "Conexão Padrão",
        },
        buttons: {
          okAdd: "Adicionar",
          okEdit: "Salvar",
          cancel: "Cancelar",
        },
        success: "Usuário salvo com sucesso.",
      },
      chat: {
        noTicketMessage: "Selecione um ticket para começar a conversar.",
      },
      ticketsManager: {
        buttons: {
          newTicket: "Novo",
        },
      },
      ticketsQueueSelect: {
        placeholder: "Filas",
      },
      tickets: {
        toasts: {
          deleted: "O ticket que você estava foi deletado.",
        },
        notification: {
          message: "Mensagem de",
        },
        tabs: {
          open: { title: "Inbox" },
          closed: { title: "Resolvidos" },
          search: { title: "Busca" },
        },
        search: {
          placeholder: "Buscar tickets e mensagens",
        },
        buttons: {
          showAll: "Todos",
        },
      },
      transferTicketModal: {
        title: "Transferir Ticket",
        fieldLabel: "Digite para buscar usuários",
        fieldQueueLabel: "Transferir para o departamento",
        fieldPoloLabel: "Polo",
        choosePolo: "Escolha o polo do departamento.",
        fieldConnectionLabel: "Transferir para conexão",
        fieldQueuePlaceholder: "Selecione uma fila",
        fieldConnectionPlaceholder: "Selecione uma conexão",
        noOptions: "Nenhum usuário encontrado com esse nome",
        chooseDestination: "Escolha um atendente ou um setor para transferir.",
        noteLabel: "Observação para quem vai atender (opcional)",
        notePlaceholder: "Ex.: cliente quer proposta para Direito, já tem histórico",
        notifyClient: "Avisar o cliente sobre a transferência",
        buttons: {
          ok: "Transferir",
          cancel: "Cancelar",
        },
      },
      ticketsList: {
        pendingHeader: "Aguardando",
        assignedHeader: "Atendendo",
        noTicketsTitle: "Nada aqui!",
        noTicketsMessage:
          "Nenhum ticket encontrado com esse status ou termo pesquisado",
        connectionTitle: "Conexão que está sendo utilizada atualmente.",
        buttons: {
          accept: "Aceitar",
        },
      },
      newTicketModal: {
        title: "Nova conversa",
        fieldLabel: "Buscar contato",
        add: "Adicionar",
        buttons: {
          ok: "Iniciar conversa",
          cancel: "Cancelar",
        },
      },
      mainDrawer: {
        listItems: {
          dashboard: "Dashboard",
          connections: "Conexões",
          tickets: "Tickets",
          contacts: "Contatos",
          quickAnswers: "Respostas Rápidas",
          queues: "Filas",
          administration: "Administração",
          users: "Usuários",
          settings: "Configurações",
        },
        appBar: {
          user: {
            profile: "Perfil",
            logout: "Sair",
          },
          darkMode: "Modo escuro",
        },
      },
      notifications: {
        noTickets: "Nenhuma notificação.",
      },
      queues: {
        title: "Filas",
        table: {
          name: "Nome",
          color: "Cor",
          greeting: "Mensagem de saudação",
          actions: "Ações",
        },
        buttons: {
          add: "Adicionar fila",
        },
        confirmationModal: {
          deleteTitle: "Excluir",
          deleteMessage:
            "Você tem certeza? Essa ação não pode ser revertida! Os tickets dessa fila continuarão existindo, mas não terão mais nenhuma fila atribuída.",
        },
      },
      queueSelect: {
        inputLabel: "Filas",
      },
      quickAnswers: {
        title: "Respostas Rápidas",
        table: {
          shortcut: "Atalho",
          message: "Resposta Rápida",
          actions: "Ações",
        },
        buttons: {
          add: "Adicionar Resposta Rápida",
        },
        toasts: {
          deleted: "Resposta Rápida excluída com sucesso.",
        },
        searchPlaceholder: "Pesquisar...",
        confirmationModal: {
          deleteTitle:
            "Você tem certeza que quer excluir esta Resposta Rápida: ",
          deleteMessage: "Esta ação não pode ser revertida.",
        },
      },
      users: {
        title: "Usuários",
        table: {
          name: "Nome",
          email: "Email",
          profile: "Perfil",
          whatsapp: "Conexão Padrão",
          actions: "Ações",
        },
        buttons: {
          add: "Adicionar usuário",
        },
        toasts: {
          deleted: "Usuário excluído com sucesso.",
        },
        confirmationModal: {
          deleteTitle: "Excluir",
          deleteMessage:
            "Todos os dados do usuário serão perdidos. Os tickets abertos deste usuário serão movidos para a fila.",
        },
      },
      settings: {
        success: "Configurações salvas com sucesso.",
        title: "Configurações",
        settings: {
          userCreation: {
            name: "Criação de usuário",
            options: {
              enabled: "Ativado",
              disabled: "Desativado",
            },
          },
        },
      },
      messagesList: {
        header: {
          assignedTo: "Atribuído à:",
          buttons: {
            return: "Retornar",
            resolve: "Resolver",
            reopen: "Reabrir",
            accept: "Aceitar",
          },
        },
      },
      messagesInput: {
        placeholderOpen: "Digite uma mensagem ou tecle ''/'' para utilizar as respostas rápidas cadastrada",
        placeholderClosed:
          "Reabra ou aceite esse ticket para enviar uma mensagem.",
        signMessage: "Assinar",
      },
      contactDrawer: {
        header: "Dados do contato",
        buttons: {
          edit: "Editar contato",
        },
        extraInfo: "Outras informações",
      },
      ticketOptionsMenu: {
        delete: "Deletar",
        transfer: "Transferir",
        confirmationModal: {
          title: "Deletar o ticket do contato",
          message:
            "Atenção! Todas as mensagens relacionadas ao ticket serão perdidas.",
        },
        buttons: {
          delete: "Excluir",
          cancel: "Cancelar",
        },
      },
      confirmationModal: {
        buttons: {
          confirm: "Ok",
          cancel: "Cancelar",
        },
      },
      messageOptionsMenu: {
        delete: "Deletar",
        reply: "Responder",
        confirmationModal: {
          title: "Apagar mensagem?",
          message: "Esta ação não pode ser revertida.",
        },
      },
      backendErrors: {
        ERR_CPF_INVALID: "CPF inválido. Confira os números.",
        ERR_CPF_ALREADY_USED: "Já existe outro lead com este CPF.",
        ERR_LEAD_NEEDS_CPF: "Informe o CPF do candidato para gerar a cobrança.",
        ERR_EFI_NOT_CONFIGURED: "A Efí ainda não foi configurada. Informe as credenciais em Configurar CRM → Pagamentos (Efí).",
        ERR_EFI_NO_CERT: "Envie o certificado .p12 da Efí em Configurar CRM → Pagamentos (Efí).",
        ERR_EFI_CERT_FORMAT: "O certificado precisa ser um arquivo .p12 ou .pfx.",
        ERR_EFI_WEBHOOK_NEEDS_HTTPS: "A Efí só envia avisos para endereço público HTTPS. Use um túnel e defina PUBLIC_URL, ou aguarde: o sistema confere os pagamentos a cada 30 segundos.",
        ERR_PAYMENT_NOT_PENDING: "Esta cobrança não está mais aguardando pagamento.",
        ERR_POLO_NO_TUTORING_QUEUE: "Este polo ainda não tem fila de tutoria. Cadastre um tutor em Polos e equipes.",
        ERR_ONBOARDING_NOT_STARTED: "A ambientação ainda não foi iniciada.",
        ERR_ONBOARDING_ALREADY_DONE: "A ambientação deste aluno já foi concluída.",
        ERR_PAYMENT_DUE_IN_PAST: "A data de vencimento precisa ser hoje ou uma data futura.",
        ERR_CAMPAIGN_NO_MESSAGE: "Escreva ao menos uma mensagem para a campanha.",
        ERR_CAMPAIGN_TOO_MANY_STEPS: "Cada campanha pode ter no máximo 5 mensagens em sequência.",
        ERR_CAMPAIGN_STEP_EMPTY: "Há uma mensagem vazia. Escreva um texto ou anexe um arquivo, ou remova a mensagem.",
        ERR_CAMPAIGN_STEPS_TEMPLATE: "Com modelo aprovado da API oficial só a primeira mensagem pode ser enviada. As seguintes dependem da resposta da pessoa.",
        ERR_CAMPAIGN_NO_LEADS: "Nenhum lead com telefone atende a esses filtros.",
        ERR_REACTION_FAILED: "O canal não aceitou esta reação. Tente outro emoji.",
        ERR_REACTION_EMOJI_UNSUPPORTED: "Este canal não aceita este emoji como reação.",
        ERR_AI_PERSONAL_NUMBER: "Este é um número pessoal: as conversas dele vão direto para o dono. Em Conexões, ligue \"Agente de IA atende primeiro\" nesse número para o agente atender.",
        ERR_AI_AGENT_NOT_AVAILABLE: "Não há agente de IA ligado para esta conversa (ou ela é um grupo). Ligue um em Agentes de IA e tente de novo.",
        ERR_PIN_LIMIT: "Você pode fixar no máximo 5 conversas. Desafixe uma para fixar outra.",
        ERR_KB_EMPTY: "Escreva ou envie o conteúdo do documento.",
        ERR_KB_TOPIC_INVALID: "O assunto deve ter letras minúsculas, números e barras, como institutional/tutoring.",
        ERR_KB_FILE_TYPE: "Formato não aceito. Envie PDF, Word (.docx), .txt, .md, .csv ou .html.",
        ERR_KB_FILE_READ: "Não foi possível ler o texto deste arquivo. Se for um PDF escaneado, copie o texto e cole.",
        ERR_RULE_EMPTY: "Escreva o ensinamento (pelo menos algumas palavras).",
        ERR_TRAIN_ZIP_EMPTY: "Não achei a conversa dentro do arquivo .zip. Exporte a conversa do WhatsApp \"sem mídia\" e envie de novo.",
        ERR_TRAIN_EXPIRED: "O arquivo enviado expirou. Envie de novo.",
        ERR_TRAIN_ATTENDANT: "Escolha quem é o atendente nesta conversa.",
        ERR_KB_URL: "Endereço não permitido. Use um endereço público começando com http:// ou https://.",
        ERR_KB_URL_FETCH: "Não foi possível ler essa página. Confira o endereço ou cole o texto.",
        ERR_AI_NO_API_KEY: "Falta a chave de API. Informe-a no agente ou na página Agentes de IA.",
        ERR_AI_NO_HISTORY: "Escreva uma mensagem do aluno para o agente responder.",
        ERR_AI_FAILED: "O provedor de IA não respondeu. Confira a chave, o modelo e tente de novo.",
        ERR_NOT_FOUND: "Não encontramos este registro. Ele pode ter sido removido.",
        ERR_IN_USE: "Não é possível remover: este registro ainda está em uso em outra parte do sistema.",
        ERR_CAMPAIGN_LOCKED: "Só dá para editar campanhas em rascunho, agendadas ou pausadas. Pause a campanha para alterar.",
        ERR_CAMPAIGN_INTERVAL: "O intervalo mínimo entre mensagens não pode ser maior que o máximo.",
        ERR_CAMPAIGN_INVALID_STATE: "Esta ação não está disponível para a situação atual da campanha.",
        ERR_CAMPAIGN_EMPTY_LIST: "A lista de contatos está vazia. Adicione contatos antes de iniciar a campanha.",
        ERR_RELATIONSHIP_WAPP_OFFLINE: "O número do relacionamento está desconectado. Reconecte em Conexões.",
        ERR_RETENTION_COLD: "Esta pessoa nunca respondeu e a conexão por QR Code está em modo seguro.",
        ERR_CONTACT_OPTED_OUT: "Esta pessoa pediu para não receber mensagens (SAIR).",
        ERR_CLOUD_WINDOW_CLOSED: "Fora das 24 horas da API oficial do WhatsApp só sai mensagem por modelo aprovado.",
        ERR_RETENTION_DAILY_LIMIT: "Limite diário de envios desta conexão por QR Code atingido. Continue amanhã.",
        ERR_RETENTION_TOO_MANY: "Escolha até 50 alunos por envio.",
        ERR_PASSWORD_SHORT: "A senha precisa ter pelo menos 8 caracteres.",
        ERR_LEAD_DELETE_ENROLLED: "Este lead já é um aluno matriculado: não pode ser excluído. Use “Não é um lead” se ele não deve aparecer no funil.",
        ERR_LEAD_DELETE_PAID: "Este lead tem cobrança paga: não pode ser excluído.",
        ERR_INVALID_OUTCOME: "Escolha o que aconteceu no contato.",
        ERR_LEAD_NOT_ENROLLED_YET: "Este lead ainda não foi matriculado: confirme a primeira matrícula antes de fazer outra.",
        ERR_LEAD_ENROLLED_RELATION: "Este lead já é um aluno matriculado: não dá para marcá-lo como amigo ou equipe.",
        ERR_CAMPAIGN_SCHEDULE_PAST: "A data de início já passou. Escolha uma data futura ou deixe vazio para iniciar manualmente.",
        ERR_CAMPAIGN_LIST_IN_USE: "Esta lista é usada por campanhas. Apague ou troque a lista nessas campanhas antes de apagá-la.",
        ERR_CAMPAIGN_NOTHING_TO_RETRY: "Não há envios com falha para tentar de novo (quem pediu para não receber mensagens fica de fora).",
        ERR_CAMPAIGN_CONNECTION_DOWN: "A conexão desta campanha não está conectada agora. Conecte e tente de novo.",
        ERR_CAMPAIGN_TEST_NUMBER: "Informe o seu número de WhatsApp com DDD para receber o teste.",
        ERR_STAGE_CHANGE: "Não foi possível mudar o lead de etapa.",
        ERR_STAGE_NOT_FOUND: "Etapa do funil não encontrada.",
        ERR_NO_LEAD_STAGES: "O funil ainda não tem etapas. Cadastre as etapas em Configurar CRM.",
        ERR_INVALID_TYPE: "Tipo de registro inválido.",
        ERR_INVALID_DATE: "Data inválida. Confira o dia e a hora.",
        ERR_INVALID_STAGE_TYPE: "O tipo da etapa precisa ser: em andamento, ganho ou perdido.",
        ERR_NO_FILE: "Escolha um arquivo para enviar.",
        ERR_EFI_PAYEE_INVALID: "O Wallet ID da Efí precisa ter de 6 a 64 letras e números, sem espaços nem traços.",
        ERR_EFI_PAYEE_IS_COMPANY: "Esse Wallet ID é o da conta da empresa. Informe o da conta do vendedor.",
        ERR_TRIGGER_EVENT_UNAVAILABLE: "Esse acontecimento ainda não está disponível para gatilhos. Escolha outro da lista.",
        ERR_FLOW_HAS_ERRORS: "O fluxo tem erros. Corrija os pontos marcados em vermelho antes de publicar.",
        ERR_FUNNEL_STAGE_TYPE: "Essa coluna não serve para essa etapa: a etapa Matriculado usa uma coluna de ganho e Sem interesse usa uma coluna de perda; as demais usam colunas abertas.",
        ERR_FUNNEL_STAGE_REPEATED: "Uma mesma coluna do CRM não pode ser usada em duas etapas do funil.",
        ERR_PERCENT_INVALID: "O percentual deve ser um número entre 0 e 100.",
        ERR_INTAKE_TERM_INVALID: "O período de ingresso deve ter o formato 2026/2.",
        ERR_AI_NO_KEY: "Cadastre a chave da IA em Agentes de IA para criar fluxos com IA.",
        ERR_AI_BAD_ANSWER: "A IA devolveu um desenho que não consegui entender. Descreva de outro jeito e tente de novo.",
        ERR_ONBOARDING_TUTOR_ONLY: "Esta é a conversa do tutor com o aluno. Quem responde é o tutor; para assumir, transfira a conversa para você.",
        ERR_COMMUNITY_NOT_GROUP: "Só grupos do WhatsApp podem ser marcados como comunidade.",
        ERR_POLO_COVERAGE_DUPLICATED: "Essa cidade já está no atendimento de outro polo. Tire-a de lá antes de colocá-la neste.",
        ERR_USER_EMAIL_EXISTS: "Já existe outra pessoa com este e-mail.",
        ERR_LAST_ADMIN: "O sistema precisa de pelo menos um administrador. Promova outra pessoa antes de mudar este acesso.",
        ERR_GOAL_PERIOD: "Informe as datas do período: o início não pode ser depois do fim.",
        ERR_COMMISSION_NOT_PAID: "Só dá para marcar como repassada a comissão de uma taxa já paga.",
        ERR_COMMISSION_VIA_WALLET: "Esta comissão já foi enviada direto para a carteira da Efí.",
        ERR_POLO_NAME_REQUIRED: "Informe o nome do polo.",
        ERR_POLO_STATE_INVALID: "Estado inválido. Use a sigla com duas letras, como RO.",
        ERR_POLO_CODE_DUPLICATED: "Já existe um polo com este código.",
        ERR_NO_POLO_FOUND: "Polo não encontrado.",
        ERR_POLO_IN_USE: "Este polo já tem leads ou conversas. Desative-o em vez de excluir.",
        ERR_POLO_MEMBER_INVALID: "Escolha um usuário e uma função válidos para este polo.",
        ERR_PAYMENT_CANCEL_FAILED: "Não foi possível confirmar o cancelamento. A cobrança continua sendo acompanhada; tente novamente.",
        ERR_SCHEDULE_DATE_INVALID: "Data do agendamento inválida.",
        ERR_SCHEDULE_IN_PAST: "A data do agendamento precisa estar no futuro.",
        ERR_SCHEDULE_NOT_PENDING: "Este agendamento já foi enviado ou cancelado.",
        ERR_WEBHOOK_URL_INVALID: "Endereço do webhook inválido. Use um endereço público começando com http:// ou https://.",
        ERR_WEBHOOK_TEST_FAILED: "O endereço não respondeu ao teste. Confira se ele está no ar e aceita requisições.",
        ERR_NO_MESSAGE_FOUND: "Mensagem não encontrada.",
        ERR_NO_MEDIA_DATA: "Não foi possível ler o arquivo desta mensagem.",
        ERR_SENDING_WAPP_MEDIA_MSG: "Não foi possível enviar o arquivo pelo WhatsApp. Confira a conexão.",
        ERR_NUMBER_NOT_ON_WHATSAPP: "Este número não tem WhatsApp.",
        ERR_TEMPLATES_UNSUPPORTED: "Este canal não envia modelos de mensagem.",
        ERR_MEDIA_NOT_FOUND: "O arquivo anexado não foi encontrado no servidor. Anexe de novo.",
        ERR_QUEUE_INVALID_NAME: "Nome do setor inválido. Use pelo menos 2 caracteres.",
        ERR_QUEUE_NAME_ALREADY_EXISTS: "Já existe um setor com este nome.",
        ERR_QUEUE_INVALID_COLOR: "Cor do setor inválida.",
        ERR_QUEUE_NOT_FOUND: "Setor não encontrado.",
        ERR__SHORTCUT_DUPLICATED: "Já existe uma resposta rápida com este atalho.",
        ERR_NO_QUICK_ANSWER_FOUND: "Resposta rápida não encontrada.",
        ERR_NO_QUICK_ANSWERS_FOUND: "Resposta rápida não encontrada.",
        ERR_RATE_LIMITED: "Envio em ritmo alto demais para proteger o número. Aguarde alguns segundos.",
        ERR_INVALID_TIMEZONE: "Fuso horário inválido. Escolha um da lista.",
        ERR_INVALID_ROLE: "Função inválida para este usuário.",
        ERR_TICKET_NO_WHATSAPP: "Esta conversa não tem conexão ativa. Escolha uma conexão e tente de novo.",
        ERR_INVALID_RISK_MODE: "Modo de proteção inválido. Use seguro ou flexível.",
        ERR_INVALID_GROUPS_MODE: "Modo de grupos inválido.",
        ERR_REVIEW_NUMBER_INVALID: "O WhatsApp para os avisos precisa ter DDD e número, por exemplo (69) 99999-0000.",
        ERR_LEARNING_EMPTY: "Escreva a pergunta e a resposta antes de aprovar.",
        ERR_LEARNING_DONE: "Este aprendizado já foi aprovado.",
        ERR_NO_PENDING_DOCUMENTS: "Este aluno não tem documento pendente.",
        ERR_LEAD_NOT_ENROLLED: "Este lead ainda não tem a matrícula confirmada.",
        ERR_REMATRICULA_NOT_CONFIGURED: "Informe o período da rematrícula na aba Configurar antes de marcar quem renovou.",
        ERR_INVALID_PARAMETER: "Algum dado enviado não é válido. Recarregue a página e tente de novo.",
        ERR_PAYLOAD_TOO_LARGE: "O que você tentou salvar é grande demais. Reduza o conteúdo e tente de novo.",
        ERR_INVALID_JSON: "O servidor recebeu dados mal formados. Recarregue a página e tente de novo.",
        ERR_FILE_TOO_LARGE: "O arquivo é maior do que o permitido. Envie um arquivo menor.",
        ERR_UPLOAD: "Não foi possível enviar o arquivo. Confira o arquivo e tente de novo.",
        ERR_CONNECTION_LIMIT: "Você já conectou o número que o administrador permite. Para conectar outro, remova o atual ou peça ao administrador para aumentar o limite.",
        ERR_CONNECTION_CAPACITY: "O servidor está no limite de números por QR Code. Peça ao administrador para aumentar a memória do servidor ou remover um número que não usa mais.",
        ERR_PAYMENT_AMOUNT: "Informe o valor da taxa de matrícula.",
        ERR_PROPOSAL_NO_GROSS: "Informe a mensalidade bruta do curso.",
        ERR_PROPOSAL_FIRST_MONTHLY: "A primeira mensalidade precisa ser maior que zero e não pode passar da mensalidade bruta.",
        ERR_PROPOSAL_ALREADY_SENT: "Esta proposta já foi enviada. Duplique-a para fazer alterações.",
        ERR_PROPOSAL_SEND_FAILED: "Não foi possível enviar a proposta. Confira se a conexão do atendimento está ativa.",
        ERR_PDF_UNAVAILABLE: "Não foi possível gerar o PDF: o Google Chrome não está configurado no servidor (CHROME_BIN).",
        ERR_NO_PROPOSAL_TEMPLATE: "Cadastre um modelo de proposta em Configurar CRM.",
        ERR_CONTACT_CARD_UNSUPPORTED: "Cartão de contato só pode ser enviado em conversas de WhatsApp.",
        ERR_POLL_UNSUPPORTED: "Enquetes só podem ser enviadas em conversas de WhatsApp.",
        ERR_POLL_INVALID: "A enquete precisa de uma pergunta e de 2 a 12 opções diferentes.",
        ERR_STAFF_GROUP: "Grupos não podem ser marcados como da equipe. Marque as pessoas, uma a uma, na lista de participantes.",
        ERR_MEDIA_EXPIRED: "Este arquivo é antigo: o WhatsApp só guarda os arquivos por cerca de dois meses e ele já saiu dos servidores. Peça para a pessoa enviar de novo.",
        ERR_MEDIA_NOT_AVAILABLE: "Não foi possível baixar este arquivo do celular. Ele pode ter sido apagado ou a conexão está fora do ar.",
        ERR_USER_NOT_FOUND: "Usuário não encontrado.",
        ERR_INTERNAL_SERVER_ERROR: "Erro interno. Tente de novo em instantes.",
        ERR_AFFILIATE_NOT_FOUND: "Afiliado não encontrado.",
        ERR_AFFILIATE_HAS_OPEN_BONUS: "Este afiliado tem bonificação a pagar. Pague ou cancele antes de excluir (ou apenas pause o afiliado).",
        ERR_AFFILIATE_NO_PHONE: "Cadastre o WhatsApp do afiliado para enviar o link.",
        ERR_AFFILIATE_SEND_FAILED: "Não foi possível enviar pelo WhatsApp. Confira se a conexão está ativa.",
        ERR_AFFILIATE_FILE_TYPE: "Tipo de arquivo não permitido. Use imagem, PDF, vídeo, Word, Excel, PowerPoint, texto ou ZIP.",
        ERR_AFFILIATE_BAD_URL: "O endereço do vídeo ou do material precisa começar com http:// ou https://.",
        ERR_AFFILIATE_MATERIAL_HAS_PRICE: "O material de apoio não pode ter valores (R$, preços ou descontos). Tire os valores do título, da descrição ou do texto.",
        ERR_AFFILIATE_MATERIAL_EMPTY: "Envie um arquivo, informe um link ou escreva o texto do material.",
        ERR_LEAD_HAS_AFFILIATE: "Este lead já está atribuído a outro afiliado.",
        ERR_BONUS_BAD_STATUS: "Esta bonificação não está numa situação que permita essa ação.",
        ERR_BONUS_ALREADY_PAID: "Esta bonificação já foi paga e não pode mais ser alterada.",
        ERR_INVALID_AMOUNT: "Valor inválido. Use um número maior ou igual a zero.",
        ERR_INVALID_PHONE: "WhatsApp inválido. Informe com DDD.",
        ERR_AI_CASE_LIMIT: "Você já tem 40 casos de teste neste agente. Apague algum para salvar outro.",
        ERR_AI_CASE_EMPTY: "Diga o que a resposta deve conter, o que não pode conter ou o que o agente deve fazer.",
        ERR_META_APP_ID: "O ID do app do Instagram tem só números (copie em developers.facebook.com > seu app > Instagram > Configuração da API com login do Instagram).",
        ERR_META_APP_NOT_CONFIGURED: "O app da Meta ainda não foi configurado. Peça ao administrador para cadastrar o ID e a chave do app em Conexões.",
        ERR_REPLY_WINDOW_CLOSED: "Passaram mais de 24 horas desde a última mensagem desta pessoa. O Instagram só permite responder dentro de 24 h. Aguarde ela escrever de novo.",
        ERR_INVALID_EMAIL: "E-mail inválido.",
        ERR_LEAD_NOT_FOUND: "Lead não encontrado.",
        ERR_LEAD_NO_PHONE: "Este lead não tem telefone para iniciar a conversa.",
        ERR_LEAD_NEEDS_PHONE_OR_EMAIL: "Informe um telefone ou e-mail válido.",
        ERR_LOST_REASON_REQUIRED: "Escolha o motivo da perda.",
        ERR_STAGE_HAS_LEADS: "Esta etapa tem leads. Mova-os antes de excluí-la.",
        ERR_FIELD_REQUIRED_name: "Informe o nome.",
        ERR_NO_PERMISSION: "Você não tem permissão para fazer isso.",
        ERR_NO_OTHER_WHATSAPP: "Deve haver pelo menos um WhatsApp padrão.",
        ERR_NO_DEF_WAPP_FOUND:
          "Nenhum WhatsApp padrão encontrado. Verifique a página de conexões.",
        ERR_MESSAGE_NOT_ON_PHONE: "Não encontrei esta mensagem no celular. Ela pode ser muito antiga. Você ainda pode apagar só aqui no sistema.",
        ERR_DELETE_ONLY_OWN: "Só dá para apagar para todos as mensagens que você enviou.",
        ERR_DELETE_TOO_OLD: "O WhatsApp só permite apagar para todos por cerca de 2 dias. Você ainda pode apagar só aqui no sistema.",
        ERR_EDIT_NOT_ALLOWED: "Só dá para editar mensagens de texto que você enviou.",
        ERR_EDIT_TOO_OLD: "O WhatsApp só permite editar por cerca de 15 minutos depois de enviar.",
        ERR_EDIT_NOT_SUPPORTED: "Este canal não permite editar mensagens.",
        ERR_EMPTY_MESSAGE: "A mensagem não pode ficar vazia.",
        ERR_HISTORY_RUNNING: "A cópia das conversas deste número já está em andamento.",
        ERR_IMPORT: "Não foi possível importar os contatos.",
        ERR_NO_CONNECTED_WHATSAPP:
          "Nenhum WhatsApp conectado. Conecte um número em Conexões para importar os contatos.",
        ERR_WAPP_NOT_INITIALIZED:
          "Esta sessão do WhatsApp não foi inicializada. Verifique a página de conexões.",
        ERR_WAPP_CHECK_CONTACT:
          "Não foi possível verificar o contato do WhatsApp. Verifique a página de conexões",
        ERR_WAPP_INVALID_CONTACT: "Este não é um número de Whatsapp válido.",
        ERR_WAPP_DOWNLOAD_MEDIA:
          "Não foi possível baixar mídia do WhatsApp. Verifique a página de conexões.",
        ERR_INVALID_CREDENTIALS:
          "Erro de autenticação. Por favor, tente novamente.",
        ERR_SENDING_WAPP_MSG:
          "Erro ao enviar mensagem do WhatsApp. Verifique a página de conexões.",
        ERR_DELETE_WAPP_MSG: "Não foi possível excluir a mensagem do WhatsApp.",
        ERR_OTHER_OPEN_TICKET: "Já existe um tíquete aberto para este contato.",
        ERR_SESSION_EXPIRED: "Sessão expirada. Por favor entre.",
        ERR_USER_CREATION_DISABLED:
          "A criação do usuário foi desabilitada pelo administrador.",
        ERR_REACTION_UNSUPPORTED: "Este canal não permite reagir a mensagens.",
        ERR_FORWARD_NO_TARGET: "Escolha ao menos uma conversa.",
        ERR_FORWARD_CLOSED_TICKET: "Só é possível encaminhar para conversas abertas.",
        ERR_MAIL_NOT_CONFIGURED: "O e-mail do sistema ainda não foi configurado. Digite a senha de app em Configurações > E-mail.",
        ERR_MAIL_SEND_FAILED: "Não foi possível enviar o e-mail. Confira o servidor, o usuário e a senha de app em Configurações > E-mail.",
        ERR_MAIL_HOST_INVALID: "Servidor de e-mail inválido.",
        ERR_MAIL_USER_INVALID: "O usuário do e-mail precisa ser um endereço de e-mail.",
        ERR_MAIL_PORT_INVALID: "Porta inválida.",
        ERR_INVALID_RESET_TOKEN: "Este link não vale mais. Peça um novo link para criar a senha.",
        ERR_PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 8 caracteres.",
        ERR_TOO_MANY_REQUESTS:
          "Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.",
        ERR_INVALID_TICKET_STATUS: "Status de atendimento inválido.",
        ERR_NO_QUEUE_FOUND: "Setor não encontrado.",
        ERR_USER_NOT_IN_QUEUE: "Esse atendente não pertence ao setor escolhido.",
        ERR_CHANNEL_MISMATCH:
          "Não é possível mudar para uma conexão de outro canal.",
        ERR_DUPLICATED_CONTACT: "Já existe um contato com este número.",
        ERR_NO_SETTING_FOUND: "Nenhuma configuração encontrada com este ID.",
        ERR_NO_CONTACT_FOUND: "Nenhum contato encontrado com este ID.",
        ERR_NO_TICKET_FOUND: "Nenhum tíquete encontrado com este ID.",
        ERR_TICKET_ALREADY_ASSIGNED: "Esta conversa já foi assumida por outro atendente. A tela foi atualizada.",
        ERR_TICKET_OWNED_BY_OTHER: "Esta conversa é de outro atendente. Peça a transferência ou, se for da gestão, assuma a conversa.",
        ERR_TICKET_CLOSED: "Esta conversa está finalizada. Reabra o atendimento para responder.",
        ERR_FORBIDDEN_CLIENT_KEY: "Este envio já foi registrado por outra pessoa.",
        ERR_PERIOD_TOO_LONG: "O período escolhido é longo demais. Use no máximo 12 meses.",
        ERR_NO_USER_FOUND: "Nenhum usuário encontrado com este ID.",
        ERR_NO_WAPP_FOUND: "Nenhum WhatsApp encontrado com este ID.",
        ERR_CREATING_MESSAGE: "Erro ao criar mensagem no banco de dados.",
        ERR_CREATING_TICKET: "Erro ao criar tíquete no banco de dados.",
        ERR_FETCH_WAPP_MSG:
          "Erro ao buscar a mensagem no WhtasApp, talvez ela seja muito antiga.",
        ERR_QUEUE_COLOR_ALREADY_EXISTS:
          "Esta cor já está em uso, escolha outra.",
        ERR_WAPP_GREETING_REQUIRED:
          "A mensagem de saudação é obrigatório quando há mais de uma fila.",
      },
    },
  },
};

export { messages };
