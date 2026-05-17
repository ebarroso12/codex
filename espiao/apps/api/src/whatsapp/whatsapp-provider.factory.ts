import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MetaCloudApiProvider } from "./providers/meta-cloud-api.provider";
import { SessionWhatsappProvider } from "./providers/session.provider";
import type { IWhatsappProvider } from "./types/whatsapp-provider.types";

@Injectable()
export class WhatsappProviderFactory {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(MetaCloudApiProvider) private readonly metaProvider: MetaCloudApiProvider,
    @Inject(SessionWhatsappProvider) private readonly sessionProvider: SessionWhatsappProvider
  ) {}

  getProvider(): IWhatsappProvider {
    const type = this.config.get<string>("WHATSAPP_PROVIDER", "meta_cloud_api");
    return type === "session_provider" ? this.sessionProvider : this.metaProvider;
  }
}
