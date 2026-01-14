import { AaaaRecord, ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import {
  CachePolicy,
  Distribution,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";

// For registering a domain name
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { HostedZone } from "aws-cdk-lib/aws-route53";

interface CloudFrontStackProps extends StackProps {
  domainName?: string;
  hostedZoneId?: string;
  hostedZoneName?: string;
}

export class CloudFrontStack extends Stack {
  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    super(scope, id, props);

    const { domainName, hostedZoneId, hostedZoneName } = props;

    const bucketName = `richardbraytutor-uptick-cloudfront`;
    const siteBucket = new Bucket(this, `${bucketName}-bucket`, {
      bucketName,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    if (!hostedZoneName || !hostedZoneId || !domainName) {
      throw new Error(
        "Unexpected missing hostedZone || hostedZoneId || domainName"
      );
    }
    const wwwSubdomain = `www.${domainName}`;

    const zone = HostedZone.fromHostedZoneAttributes(
      this,
      "ImportedHostedZone",
      {
        hostedZoneId,
        zoneName: hostedZoneName,
      }
    );

    const certStack = new Certificate(this, "UsEastCert", {
      domainName,
      subjectAlternativeNames: [wwwSubdomain],
      validation: CertificateValidation.fromDns(zone),
    });

    const distribution = new Distribution(this, "uptick-distribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED,
      },
      defaultRootObject: "/uptickart/index.html",
      domainNames: [domainName, wwwSubdomain],
      certificate: certStack,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/uptickart/index.html",
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/uptickart/index.html",
          ttl: Duration.seconds(0),
        },
      ],
    });

    // Apex domain -> CloudFront
    new ARecord(this, "ApexARecord", {
      zone,
      recordName: "uptickart.com",
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    new AaaaRecord(this, "ApexAaaaRecord", {
      zone,
      recordName: "uptickart.com",
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    new ARecord(this, "WwwA", {
      zone,
      recordName: "www",
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });
    new AaaaRecord(this, "WwwAAAA", {
      zone,
      recordName: "www",
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });
    new CfnOutput(this, "CloudFrontDistributionUrlOutput", {
      value: `https://${domainName}`,
    });

    new CfnOutput(this, "CloudFrontBucketNameOutput", {
      value: siteBucket.bucketName,
    });

    new CfnOutput(this, "CloudFrontDistributionIdOutput", {
      value: distribution.distributionId,
    });
  }
}
