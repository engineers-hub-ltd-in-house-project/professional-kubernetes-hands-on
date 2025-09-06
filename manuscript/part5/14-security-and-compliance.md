# 第14章: セキュリティとコンプライアンス

### 学習目標

- Kubernetesのセキュリティにおける4つのレイヤー（4C）を理解する。
- Network Policyを使い、Pod間の通信をファイアウォールのように制御できる。
- Pod Security Standardsを使い、ワークロードの実行権限を制限し、セキュリティを強化できる。
- Trivyなどのツールを使い、コンテナイメージの脆弱性をスキャンする重要性を理解する。
- 外部のシークレット管理ツールと連携する、より高度なシークレット管理パターンを理解する。

---

Kubernetesは本番環境でアプリケーションを実行するための強力なプラットフォームですが、その力を安全に利用するには、セキュリティの概念を深く理解し、適切に設定することが不可欠です。セキュリティは後付けの機能ではなく、開発の初期段階から組み込むべき継続的なプロセス（DevSecOps）です。

クラウドネイティブセキュリティには**4C (Cloud, Cluster, Container, Code)** という階層的な考え方があります。この章では、主に**Cluster**（クラスタ全体の設定）と**Container**（コンテナとPodのセキュリティ）のレイヤーに焦点を当てます。

## 1. 【See & Do】Network Policy: Podのためのファイアウォール

Kubernetesのデフォルトのネットワークモデルは**非隔離型**です。つまり、何もしなければ、全てのPodは他の全てのPodと自由に通信できてしまいます。これは「ゼロトラスト（何も信頼しない）」の原則に反しており、セキュリティ上好ましくありません。もし一つのPodが侵害された場合、攻撃者がクラスタ内の他のPodへ簡単に侵入（ラテラルムーブメント）する足がかりを与えてしまいます。

**NetworkPolicy**は、Podレベルで動作する仮想的なファイアウォールです。ラベルセレクターを使い、どのPodがどのPodと通信できるか（またはできないか）を定義します。

> **注意:** NetworkPolicyを有効にするには、CalicoやCiliumといった、この機能をサポートするネットワークプラグイン（CNI）が必要です。Minikubeや多くのマネージドサービスでは、デフォルトで利用可能またはアドオンとして有効化できます。

### ハンズオン: Network Policyによる通信制御

1.  **サンプルアプリのデプロイ**
    通信の送信元となる`frontend-pod`と、送信先となる`backend-deployment`をデプロイします。

    ```bash
    $ kubectl apply -f professional-kubernetes-hands-on/src/part5/security/backend-app.yaml
    $ kubectl apply -f professional-kubernetes-hands-on/src/part5/security/frontend-pod.yaml
    ```

2.  **デフォルトでの通信確認**
    `frontend-pod`の中から`backend-service`にアクセスできることを確認します。

    ```bash
    $ kubectl exec -it frontend-pod -- wget -O- http://backend-service
    Hello, world! Version: 1.0.0 ...
    ```

    デフォルトでは通信可能であることがわかります。

3.  **デフォルト拒否ポリシーの適用**
    まず、`backend`アプリへの全てのIngress（内向き）通信を拒否するポリシーを適用します。これがゼロトラストの第一歩です。

    ```bash
    $ kubectl apply -f professional-kubernetes-hands-on/src/part5/security/deny-all-policy.yaml
    ```

4.  **通信がブロックされることを確認**
    再度`frontend-pod`からアクセスを試みます。今度はタイムアウトして失敗するはずです。

    ```bash
    $ kubectl exec -it frontend-pod -- wget -T 5 -O- http://backend-service
    wget: download timed out
    ```

5.  **特定の通信のみを許可するポリシーの適用**
    次に、`app=frontend`のラベルを持つPodから、`app=backend`のラベルを持つPodのポート`8080`への通信のみを明示的に許可するポリシーを適用します。

    ```bash
    $ kubectl apply -f professional-kubernetes-hands-on/src/part5/security/allow-frontend-policy.yaml
    ```

6.  **通信が再度可能になることを確認**
    三度`frontend-pod`からアクセスを試みます。今度は成功するはずです。

    ```bash
    $ kubectl exec -it frontend-pod -- wget -O- http://backend-service
    Hello, world! Version: 1.0.0 ...
    ```

    このように、NetworkPolicyによってPod間の通信を厳密に制御できます。

## 2. 【See & Do】Pod Security Standards: ワークロードの強化

コンテナ内でのプロセスの権限を制限することも重要です。例えば、コンテナが`root`ユーザーで実行されたり、ホストのファイルシステムにアクセスできたりすると、コンテナからの脱出（コンテナエスケープ）といった深刻な攻撃に繋がる可能性があります。

**Pod Security Standards (PSS)** は、Podが持つべきセキュリティコンテキストを定義する、Kubernetesの組み込みの標準です。`privileged`（非制限）、`baseline`（基本的な制限）、`restricted`（厳しい制限）の3つのレベルがあります。

この標準は、**Namespace**のラベルを使って適用します。例えば、あるNamespaceに`restricted`のラベルを付けると、そのNamespaceでは、`root`での実行禁止や特定のカーネル機能の無効化といった厳しいセキュリティ要件を満たさないPodは作成できなくなります。

### ハンズオン: PSSによるPod作成の制限

1.  **テスト用Namespaceの作成とラベル付け**

    ```bash
    $ kubectl create namespace pss-demo
    # "restricted"標準を適用し、違反した場合は警告(warn)と監査ログ(audit)を出す
    $ kubectl label ns pss-demo pod-security.kubernetes.io/enforce=restricted pod-security.kubernetes.io/warn=restricted pod-security.kubernetes.io/audit=restricted
    ```

2.  **特権付きPodの作成（失敗）**
    `restricted`標準に違反する、特権付きのPodを作成しようとします。

    ```bash
    $ kubectl apply -f professional-kubernetes-hands-on/src/part5/security/privileged-pod.yaml -n pss-demo
    Error from server (Forbidden): error when creating "...privileged-pod.yaml": pods "privileged-pod" is forbidden: violates PodSecurity "restricted:latest": privileged ...
    ```

    APIサーバーによってPodの作成が拒否されることがわかります。

## 3. 【See & Do】コンテナイメージの脆弱性スキャン

アプリケーションコードにバグがないとしても、ベースイメージや利用しているライブラリに既知の脆弱性（CVE）が存在する可能性があります。コンテナイメージをビルドした後、デプロイする前に脆弱性をスキャンすることが不可欠です。

**Trivy**は、Aqua Security社が開発した人気のオープンソース脆弱性スキャナーです。

### ハンズオン: Trivyによるイメージスキャン

[TrivyのGitHubリリースページ](https://github.com/aquasecurity/trivy/releases)から、お使いのOSに合った実行ファイルをダウンロードしてパスの通った場所に置いてください。

```bash
# 古いイメージをスキャンしてみる
$ trivy image python:3.8.0-alpine3.11

# 多数の脆弱性がHIGHやCRITICALレベルで検出されるはず

# より新しいイメージをスキャンしてみる
$ trivy image python:3.10.5-alpine3.16

# 脆弱性の数が大幅に減っていることがわかる
```

この結果から、常にベースイメージを最新の状態に保つことの重要性がわかります。イメージスキャンは、CI/CDパイプラインに組み込むのが一般的です。

## 4. 【See】高度なシークレット管理

KubernetesのSecretリソースは、デフォルトではBase64エンコードされているだけで、暗号化されていません。`etcd`（Kubernetesのデータベース）にアクセスできれば、中身は簡単に見えてしまいます。

より高度なセキュリティが求められる環境では、**HashiCorp Vault**や**AWS/GCP/AzureのKey Management Service**といった外部のシークレット管理ツールを利用するのが一般的です。**External Secrets Operator**などのツールをKubernetesに導入すると、Podは外部のシークレットストアから直接、安全に機密情報を取得できます。

## 5. まとめ

- **NetworkPolicy**は、Pod間の通信を明示的に許可する「デフォルト拒否」モデルを実現し、ゼロトラストセキュリティの基礎を築く。
- **Pod Security Standards**は、Namespace単位でPodのセキュリティレベルを強制し、危険な操作を未然に防ぐ。
- **イメージスキャニング**は、CI/CDパイプラインの重要なステップであり、デプロイ前に既知の脆弱性を発見するのに役立つ。
- 機密性の高い情報を扱う場合は、デフォルトのSecretリソースの代わりに、**外部のシークレット管理ツール**との連携を検討する。

## 6. 【Check】理解度チェック

1.  デフォルト状態のKubernetesクラスタにおける、Pod間のネットワーク接続ポリシーはどのようになっていますか？また、その通信を制限するために使用するリソースは何ですか？
2.  クラスタ全体で、いかなるPodもrootユーザーとして実行されることを禁止したいです。どの組み込み標準を利用すべきですか？また、それは一般的にどのレベル（Pod, Deployment, Namespace）で強制されますか？
3.  CI/CDパイプラインで新しいコンテナイメージをビルドしました。それをレジストリにPushしてデプロイする前に、必ず行うべき重要なセキュリティステップは何ですか？
