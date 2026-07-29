# Diretrizes do Projeto — Pastor Fabiano Gonçalves

## 1. 🛡️ REGRA ANTI-REPETIÇÃO RIGOROSA (MEMÓRIA DAS IAs)
As Inteligências Artificiais e crons do projeto NUNCA podem repetir conteúdos já criados ou publicados:
- **Pensamentos do Dia**: Todo pensamento gerado deve ser 100% inédito. O sistema consulta os pensamentos existentes antes de inserir novos.
- **Artigos / Devocionais**: Todos os artigos e devocionais devem ter títulos, reflexões e versículos abordados de forma inédita, buscando os 20 últimos artigos no D1 e alimentando a memória no prompt da IA.
- **Notícias**: Desduplicação por `fonte_url`, `slug` e títulos de matérias anteriores no D1 injetados na memória da IA antes de reescrever novos feeds RSS.

## 2. 🕒 FUSO HORÁRIO & DATAS (UTC-3 HORÁRIO DE BRASÍLIA)
Todas as operações de data, agendamento e exibição do site utilizam estritamente o fuso horário oficial do Brasil (**Horário de Brasília: UTC-3**).
- As funções de data utilizam o helper `getTodayBRT()` (`Date.now() - 3 * 3600 * 1000`) para garantir que a transição de dia ocorra exatamente à meia-noite do Brasil (BRT).

## 3. ✝️ VISÃO EDITORIAL E PASTORAL
- Lema: *"Foco e Força — Fé e Vitória"*.
- Direita moderada, conservadora em valores éticos/morais, cristã evangélica e pró-livre mercado com responsabilidade social e valorização da família.
- Proteção TSE / Imunidade: Proibição estrita de termos partidários, números de candidatos, slogans eleitorais ou pedidos de voto em qualquer conteúdo publicado.

## 4. 💡 DIRETRIZ EXCLUSIVA PARA O PENSAMENTO DO DIA (STEWARDSHIP / MORDOMIA)
O Pensamento do Dia é a assinatura diária do Pastor Fabiano Gonçalves e deve seguir estritamente o conceito cristão de **Mordomia (Stewardship)** e **Esperança Ativa**:
- **Mordomia (Stewardship)**: Deus nos confiou recursos (tempo, talentos, dinheiro, inteligência e influência) para administrarmos com responsabilidade, para a glória de Deus e benefício da sociedade.
- **Economista & Político Moderado**: O mercado não é um fim em si mesmo, mas uma ferramenta de liberdade e dignidade. Trabalho honesto e família forte são o maior programa social.
- **3 Pilares Temáticos**:
  1. *Economia com Propósito*: Trabalho como vocação, ética na criação de riqueza, finanças de Provérbios, generosidade estratégica.
  2. *Cidadania & Conservadorismo Moderado*: Subsidiariedade (família/comunidade antes do Estado), família como base econômica, liberdade com responsabilidade moral, paz no debate sem polarização tóxica.
  3. *Motivação & Resiliência*: Resiliência nas crises, poder dos pequenos começos, vencendo a ansiedade com propósito e lições dos heróis bíblicos.

## 5. 📰 CURADOR CHEFE DE JORNALISMO CRISTÃO (REGRA DE OURO ANTI-FOFOCA)
As notícias capturadas dos feeds RSS (Gazeta do Povo Economia, Repórter Gospel, Gospel+, Notícia Cristã) passam pelo **Filtro Rigoroso de Curadoria**:
- **BANIMENTO TOTAL**: Banir, eliminar e reprovar automaticamente qualquer fofoca, rumor, escândalo ou matérias que denigram a imagem de líderes, pastores, igrejas ou irmãos na fé.
- **APROVAÇÃO**: Apenas conteúdos edificantes, informativos, econômicos e úteis são reescritos e enviados para aprovação no Telegram com a mensagem padronizada:  
  `✅ Eu eliminei, sob o treinamento que obtive, toda fofoca ou matéria que denigre líderes e irmãos. Abaixo segue a matéria do feed, OK para aprovação no Telegram:`

## 6. ⚖️ DIRETRIZ GLOBAL DE EXCLUSIVIDADE E DIREITOS AUTORAIS (COPYRIGHT)
- **1. Reescrita Total (Anti-Plágio de Texto)**: Proibição absoluta de copy/paste. As notícias são reescritas 100% do zero com linguagem autoral do portal a partir dos fatos apurados, garantindo blindagem jurídica de direitos autorais.
- **2. Recriação de Imagens & Preservação de Fisionomia**:
  - *Imagens com Pessoas/Figuras Públicas*: É terminantemente PROIBIDO alterar o rosto, a fisionomia, a etnia ou a identidade da pessoa. Apenas o pano de fundo (background), iluminação ou filtro ambiental podem ser modificados/estilizados.
  - *Imagens Genéricas (objetos, prédios, gráficos, paisagens)*: Liberdade para recriar imagens do zero totalmente novas e livres de royalties.
